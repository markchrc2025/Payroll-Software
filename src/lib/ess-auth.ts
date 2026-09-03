/**
 * ESS Auth — Employee Self-Service authentication helpers.
 *
 * Authentication flow:
 *   1. Employee posts { employeeNumber, birthDate } (or { employeeNumber, pin })
 *      to POST /api/ess/auth.
 *   2. Server verifies identity, generates a 32-byte random token, stores its
 *      SHA-256 hash in `EssSession` with an 8-hour expiry, and returns the raw
 *      token to the client.
 *   3. The client includes `Authorization: Bearer <rawToken>` on every ESS
 *      request.
 *   4. `getEssContext(req)` hashes the incoming token and looks it up in
 *      `EssSession`.  If valid, returns `{ tenantId, employeeId }`.
 *
 * Security:
 *   - Raw token is never persisted — only SHA-256(token) is stored.
 *   - Sessions expire after 8 hours (configurable via ESS_SESSION_HOURS).
 *   - Sessions can be revoked (logout) by setting `revokedAt`.
 *   - birthDate comparison is done in UTC midnight form to avoid timezone drift.
 *   - ESS PIN (if set) is bcrypt-hashed via the same encryptedField extension.
 */
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { evaluateEssAccess } from "@/lib/ess-access-gate";
import { captureError } from "@/lib/observability";
import prismaAdmin from "@/lib/prisma-admin";
import { withTenant } from "@/lib/with-tenant";

export type EssContext = {
  tenantId: string;
  employeeId: string;
};

const SESSION_HOURS = Number(process.env.ESS_SESSION_HOURS ?? "8");

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically secure 32-byte token (returned as hex). */
export function generateEssToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex digest — stored in DB, never the raw token. */
export function hashEssToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** bcrypt-hash an ESS PIN (4–8 digits). */
export async function hashEssPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

/** Verify a plain-text PIN against a bcrypt hash. */
export async function verifyEssPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/** bcrypt-hash an ESS password. */
export async function hashEssPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Verify a plain-text ESS password against a bcrypt hash. */
export async function verifyEssPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new ESS session for the given employee.
 * Returns the RAW token — caller must deliver it to the client and must NOT
 * store it themselves.
 */
export async function createEssSession(
  tenantId: string,
  employeeId: string,
): Promise<string> {
  const rawToken = generateEssToken();
  const tokenHash = hashEssToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await withTenant(tenantId, (tx) =>
    tx.essSession.create({
      data: { tenantId, employeeId, tokenHash, expiresAt },
    }),
  );

  return rawToken;
}

/**
 * Revoke all active sessions for the given employee (used by logout).
 * Marks `revokedAt` rather than deleting so audit trail is preserved.
 */
export async function revokeEssSession(
  tenantId: string,
  tokenHash: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.essSession.updateMany({
      where: {
        tenantId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    }),
  );
}

// ---------------------------------------------------------------------------
// Request-level context
// ---------------------------------------------------------------------------

/**
 * Extract the ESS context from an incoming request.
 *
 * Reads the `Authorization: Bearer <rawToken>` header, hashes it, verifies it
 * against an active (non-expired, non-revoked) `EssSession`, AND re-checks the
 * employee's live entitlement. Returns `null` if any of that fails.
 *
 * LIVE STATE, NOT A FROZEN SNAPSHOT (unit 0.19). This used to validate only
 * `tokenHash`, `expiresAt` and `revokedAt`, so the access gates were enforced
 * at sign-in and never again: an employee terminated mid-session kept full ESS
 * access until the token expired (8h by default). That is not a narrow
 * disclosure — `/api/ess/ot-applications` can auto-approve filed overtime
 * straight onto a `DTRRecord`, so a terminated employee could fabricate paid OT.
 *
 * PULL, NOT PUSH. Revoking sessions when employment ends would be cheaper, but
 * it is only as complete as the list of paths that remember to do it — and that
 * list is already short: offboarding, the employee PATCH, soft-delete,
 * movements and bulk import all change employment state today WITHOUT revoking.
 * Re-checking here cannot be forgotten by a new path, because every ESS route
 * authenticates through this one function. Existing revocation is kept as
 * defence in depth; it is an optimisation, not the guarantee.
 *
 * COSTS NO EXTRA ROUND TRIP. The employee row joins into the session lookup
 * that was already happening, so this is the same single query it always was.
 *
 * Returning `null` rather than a typed refusal is deliberate: all 29 ESS routes
 * already answer `null` with 401, and the ESS client clears its token and
 * redirects to /ess/login on 401. The employee therefore lands on the sign-in
 * screen, where unit 0.14's gate answers with the specific reason ("no longer
 * active", "contact HR"). The detailed copy already exists there; this path
 * only has to stop working.
 */
export async function getEssContext(
  req: NextRequest,
): Promise<EssContext | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;

  const tokenHash = hashEssToken(rawToken);
  const now = new Date();

  // RLS requires a tenant GUC which we don't have yet (tenantId is unknown
  // before the session is validated).  Use the admin client (BYPASSRLS) so
  // the lookup succeeds, then hand off to the app-scoped client for all
  // subsequent queries.
  //
  // The JOIN is what makes the re-check free: `employeeId` is a FK to the
  // Employee primary key, so this is a single indexed lookup on a query that
  // had to run anyway.
  const sessions = await prismaAdmin.$queryRaw<
    Array<{
      id: string;
      tenantId: string;
      employeeId: string;
      deletedAt: Date | null;
      employmentStatus: string;
      essAccessStatus: string;
      essDeactivateAt: Date | null;
    }>
  >`
    SELECT s.id, s."tenantId", s."employeeId",
           e."deletedAt", e."employmentStatus",
           e."essAccessStatus", e."essDeactivateAt"
    FROM "EssSession" s
    JOIN "Employee" e ON e.id = s."employeeId"
    WHERE s."tokenHash" = ${tokenHash}
      AND s."expiresAt" > ${now}
      AND s."revokedAt" IS NULL
    LIMIT 1
  `;

  if (sessions.length === 0) return null;
  const session = sessions[0]!;

  // The SAME gate the sign-in paths use (units 0.14/0.18) — one implementation,
  // no third copy. A session is only as good as the entitlement behind it.
  const access = evaluateEssAccess(session, now);
  if (!access.allowed) {
    // Someone holding a valid, unexpired token was refused: their entitlement
    // changed underneath a live session. Security-relevant, not a routine 401.
    await captureError(
      new Error(`ESS session refused mid-flight: ${access.reason}`),
      {
        scope: "ess/session:refused",
        critical: true,
        reason: access.reason,
        tenantId: session.tenantId,
        employeeId: session.employeeId,
      },
    );
    return null;
  }

  return { tenantId: session.tenantId, employeeId: session.employeeId };
}
