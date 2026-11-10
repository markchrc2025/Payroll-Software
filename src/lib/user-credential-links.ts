/**
 * Account links for HR/admin (tenant) users and Central admins
 * (unit 0.15 Amendment 2, rulings B7 and B8). The ESS equivalent is
 * src/lib/ess-credential-links.ts.
 *
 * TWO ENGINES, one table (PasswordResetToken), told apart by `purpose`:
 *
 *   INVITE  sets a new account's first password. For a Central admin (created
 *           inactive with no password) accepting the invitation is what
 *           activates the account. A tenant user is activated by Central's
 *           "activate" action, never by a link, so a tenant INVITE requires an
 *           account that is already active.
 *   RESET   changes the password of an ACTIVE account and nothing else. It
 *           NEVER activates. Before this amendment the Central set-password
 *           endpoint set `isActive: true` for ANY token, so a reset link sent
 *           to a deactivated Central admin switched them back on.
 *
 * Shared rules: one live link per user and purpose (issuing retires the older
 * unused ones of that purpose); a link is claimed atomically before anything is
 * written; on success every other unused link of that user is retired; and the
 * user's running sessions end (`sessionsValidAfter`, checked on every request
 * by src/lib/session-cutoff.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import type { UserLinkPurpose } from "@prisma/client";
import type prismaAdmin from "@/lib/prisma-admin";

type Db = typeof prismaAdmin;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export const hashLinkToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Issue the user's one live link of this purpose. Returns the raw token for the email. */
export async function issueUserLink(
  db: Db,
  args: { userId: string; purpose: UserLinkPurpose; ttlMs?: number },
): Promise<string> {
  const ttl = args.ttlMs ?? (args.purpose === "INVITE" ? INVITE_TTL_MS : RESET_TTL_MS);
  const raw = randomBytes(32).toString("hex");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: args.userId, purpose: args.purpose, usedAt: null },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: args.userId,
        purpose: args.purpose,
        tokenHash: hashLinkToken(raw),
        expiresAt: new Date(now.getTime() + ttl),
      },
    });
  });
  return raw;
}

export type ClaimUserLinkResult =
  | { ok: true; userId: string; email: string; firstName: string; purpose: UserLinkPurpose }
  | { ok: false; reason: "invalid" | "inactive" };

/**
 * Use a link. `scope: "central"` accepts only Central admins (tenantId null);
 * `"any"` accepts any account (the tenant /reset-password page, which the
 * forgot-password email for every account points at).
 */
export async function claimUserLink(
  db: Db,
  rawToken: string,
  passwordHash: string,
  opts: { scope: "central" | "any" },
): Promise<ClaimUserLinkResult> {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashLinkToken(rawToken) },
      select: { id: true, userId: true, purpose: true, usedAt: true, expiresAt: true },
    });
    if (!record || record.usedAt !== null || record.expiresAt <= now) return { ok: false, reason: "invalid" } as const;

    const user = await tx.user.findFirst({
      where: { id: record.userId, deletedAt: null, ...(opts.scope === "central" ? { tenantId: null } : {}) },
      select: { id: true, email: true, firstName: true, isActive: true, tenantId: true, passwordHash: true },
    });
    if (!user) return { ok: false, reason: "invalid" } as const;

    // Which engine, which rule.
    const centralFirstActivation =
      record.purpose === "INVITE" && user.tenantId === null && !user.isActive && user.passwordHash === "";
    if (!user.isActive && !centralFirstActivation) return { ok: false, reason: "inactive" } as const;

    const claim = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return { ok: false, reason: "invalid" } as const;

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionsValidAfter: now,
        // Unit 0.15 Am 4: using a link also lifts a wrong-password lock.
        failedLoginCount: 0,
        lockedUntil: null,
        ...(centralFirstActivation ? { isActive: true } : {}),
      },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    return { ok: true, userId: user.id, email: user.email, firstName: user.firstName, purpose: record.purpose } as const;
  });
}
