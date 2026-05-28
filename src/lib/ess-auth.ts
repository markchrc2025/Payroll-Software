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
import prisma from "@/lib/prisma";
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
 * Reads the `Authorization: Bearer <rawToken>` header, hashes it, and
 * verifies it against an active (non-expired, non-revoked) `EssSession`.
 * Returns `null` if no valid session is found.
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
  const sessions = await prismaAdmin.$queryRaw<
    Array<{ id: string; tenantId: string; employeeId: string }>
  >`
    SELECT id, "tenantId", "employeeId"
    FROM "EssSession"
    WHERE "tokenHash" = ${tokenHash}
      AND "expiresAt" > ${now}
      AND "revokedAt" IS NULL
    LIMIT 1
  `;

  if (sessions.length === 0) return null;
  const session = sessions[0]!;

  return { tenantId: session.tenantId, employeeId: session.employeeId };
}
