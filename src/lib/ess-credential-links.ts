/**
 * ESS credential links (unit 0.15 Amendment 1, ruling B7): TWO SEPARATE ENGINES.
 *
 *   INVITATION  (table EssInvite)        the ONLY way an ESS account becomes
 *                                        ACTIVE. One live link per employee.
 *   PASSWORD RESET (table EssPasswordReset) changes the password of an account
 *                                        that is ALREADY ACTIVE. Never
 *                                        activates, never changes access.
 *
 * Why two engines: before this amendment a reset link on an INVITED account
 * activated it, so a reset was a second, unaudited activation path, and the
 * forgot-password form handed reset links to accounts HR had invited but the
 * employee had never activated. Mark's ruling B7: the reset stays unique to
 * the employee who asked for it, the invitation stays unique to each user
 * added, and neither can do the other's job.
 *
 * Rules both engines share:
 *   - a raw token is shown once (in the email); only its SHA-256 is stored;
 *   - issuing a link retires every earlier unused link of the SAME kind for
 *     that employee, so only the newest one works;
 *   - a link is CLAIMED atomically (`usedAt: null` in the WHERE, count must be
 *     1) before anything is written, so two requests racing with one link
 *     cannot both succeed;
 *   - separated employees (RESIGNED, TERMINATED, RETIRED) are refused;
 *   - every open ESS session is ended when the password changes (ruling B8).
 *
 * Amendment 3 (Mark's ruling of 10 Nov): the credential both engines set is
 * the employee's 6-digit PIN, the default ESS sign-in. HR never sets or sees
 * it. Links go to the email the employee's record chooses (personal at hiring,
 * switchable to work). Using either link also lifts a wrong-attempt lock. A
 * reset also removes the optional password, so whoever learned the old
 * credentials keeps neither.
 */
import type { Prisma } from "@prisma/client";
import { ENDED_EMPLOYMENT_STATUSES } from "@/lib/ess-access-gate";
import { generateEssToken, hashEssPin, hashEssToken } from "@/lib/ess-auth";
import { pinProblem } from "@/lib/ess-pin-policy";
import type prismaAdmin from "@/lib/prisma-admin";
import type { EssEmailChoice } from "@prisma/client";

type Db = typeof prismaAdmin;
/** Any transaction client: prismaAdmin's, or the tenant client's inside withTenant. */
type Tx = Prisma.TransactionClient;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

const isSeparated = (status: string) =>
  (ENDED_EMPLOYMENT_STATUSES as readonly string[]).includes(status);

/**
 * The email that receives this employee's ESS links: the personal email by
 * default (hiring), the work email once HR switches the record to WORK. No
 * silent fallback to the other address: null means "add that email first".
 */
export function essLinkEmail(emp: {
  essEmailChoice: EssEmailChoice;
  personalEmail: string | null;
  workEmail: string | null;
}): string | null {
  const email = emp.essEmailChoice === "WORK" ? emp.workEmail : emp.personalEmail;
  return email && email.trim() ? email.trim() : null;
}

const LINK_EMAIL_SELECT = { essEmailChoice: true, personalEmail: true, workEmail: true } as const;

// ── shared ───────────────────────────────────────────────────────────────────

/** End every open ESS session of an employee (password changed or reset). */
export async function endAllEssSessions(tx: Tx, employeeId: string, at = new Date()) {
  return tx.essSession.updateMany({
    where: { employeeId, revokedAt: null },
    data: { revokedAt: at },
  });
}

/**
 * Delete every ESS passkey of an employee (PAY-115, Mark's ruling of 15 Nov
 * 2026): disabling ESS access deletes the employee's passkeys, on every disable
 * path (HR's disable, a schedule set in the past, the hourly sweep). A
 * re-activated employee registers again. Returns the number deleted.
 */
export async function retirePasskeys(tx: Tx, employeeId: string): Promise<number> {
  const res = await tx.essWebAuthnCredential.deleteMany({ where: { employeeId } });
  return res.count;
}

// ── INVITATION engine ────────────────────────────────────────────────────────

/** Retire every unused invitation for an employee (re-invite, disable). */
export async function retireInvites(tx: Tx, employeeId: string, at = new Date()) {
  return tx.essInvite.updateMany({
    where: { employeeId, usedAt: null },
    data: { usedAt: at },
  });
}

/** Issue the employee's one live invitation. Returns the raw token for the email. */
export async function issueInvite(
  tx: Tx,
  args: { tenantId: string; employeeId: string; now?: Date },
): Promise<{ rawToken: string; expiresAt: Date }> {
  const now = args.now ?? new Date();
  await retireInvites(tx, args.employeeId, now);
  const rawToken = generateEssToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await tx.essInvite.create({
    data: { tenantId: args.tenantId, employeeId: args.employeeId, tokenHash: hashEssToken(rawToken), expiresAt },
  });
  return { rawToken, expiresAt };
}

export type ClaimInviteResult =
  | { ok: true; employeeId: string; employeeNumber: string }
  | { ok: false; reason: "invalid" | "separated" }
  | { ok: false; reason: "weak_pin"; message: string };

/**
 * Accept an invitation: the only path from INVITED to ACTIVE. Refuses a link
 * that is unknown, used, retired or expired, and an employee who is not
 * currently INVITED (already active, disabled, never invited) or is separated.
 */
export async function claimInvite(db: Db, rawToken: string, pin: string): Promise<ClaimInviteResult> {
  const tokenHash = hashEssToken(rawToken);
  return db.$transaction(async (tx) => {
    const now = new Date();
    const invite = await tx.essInvite.findUnique({
      where: { tokenHash },
      select: { id: true, employeeId: true, usedAt: true, expiresAt: true },
    });
    if (!invite || invite.usedAt !== null || invite.expiresAt <= now) return { ok: false, reason: "invalid" } as const;

    const emp = await tx.employee.findFirst({
      where: { id: invite.employeeId, deletedAt: null },
      select: { id: true, employeeNumber: true, birthDate: true, employmentStatus: true, essAccessStatus: true },
    });
    if (!emp) return { ok: false, reason: "invalid" } as const;
    if (isSeparated(emp.employmentStatus)) return { ok: false, reason: "separated" } as const;
    if (emp.essAccessStatus !== "INVITED") return { ok: false, reason: "invalid" } as const;
    // Checked BEFORE the link is claimed, so a refused PIN does not burn it.
    const problem = pinProblem(pin, { birthDate: emp.birthDate, employeeNumber: emp.employeeNumber });
    if (problem) return { ok: false, reason: "weak_pin", message: problem } as const;
    const pinHash = await hashEssPin(pin);

    const claim = await tx.essInvite.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return { ok: false, reason: "invalid" } as const;

    await tx.employee.update({
      where: { id: emp.id },
      data: {
        essPin: pinHash,
        essAccessStatus: "ACTIVE",
        essActivatedAt: now,
        essFailedAttempts: 0,
        essLockedUntil: null,
      },
    });
    await retireInvites(tx, emp.id, now);
    await endAllEssSessions(tx, emp.id, now);
    return { ok: true, employeeId: emp.id, employeeNumber: emp.employeeNumber } as const;
  });
}

// ── PASSWORD RESET engine ────────────────────────────────────────────────────

/** Retire every unused reset link for an employee. */
export async function retireResets(tx: Tx, employeeId: string, at = new Date()) {
  return tx.essPasswordReset.updateMany({
    where: { employeeId, usedAt: null },
    data: { usedAt: at },
  });
}

/**
 * Issue a reset link (Forgot PIN), but ONLY for an ACTIVE, employed account
 * whose chosen link email is on file. Returns null otherwise; the caller
 * answers the same generic message either way, so the form never reveals which
 * accounts exist or their state.
 */
export async function issueReset(
  tx: Tx,
  args: { tenantId: string; employeeId: string; now?: Date },
): Promise<{ rawToken: string; expiresAt: Date; email: string } | null> {
  const now = args.now ?? new Date();
  const emp = await tx.employee.findFirst({
    where: { id: args.employeeId, tenantId: args.tenantId, deletedAt: null },
    select: { essAccessStatus: true, employmentStatus: true, ...LINK_EMAIL_SELECT },
  });
  const email = emp ? essLinkEmail(emp) : null;
  if (!emp || !email || emp.essAccessStatus !== "ACTIVE" || isSeparated(emp.employmentStatus)) return null;
  await retireResets(tx, args.employeeId, now);
  const rawToken = generateEssToken();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  await tx.essPasswordReset.create({
    data: { tenantId: args.tenantId, employeeId: args.employeeId, tokenHash: hashEssToken(rawToken), expiresAt },
  });
  return { rawToken, expiresAt, email };
}

export type ClaimResetResult =
  | { ok: true; employeeId: string; email: string | null }
  | { ok: false; reason: "invalid" | "separated" | "not_active" }
  | { ok: false; reason: "weak_pin"; message: string };

/**
 * Use a reset link: sets the new PIN on an ACTIVE account, removes the
 * optional password, lifts any wrong-attempt lock, ends every session and
 * retires the employee's other reset links. Never touches essAccessStatus: an
 * account that is not ACTIVE is refused, not activated.
 */
export async function claimReset(db: Db, rawToken: string, pin: string): Promise<ClaimResetResult> {
  const tokenHash = hashEssToken(rawToken);
  return db.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.essPasswordReset.findUnique({
      where: { tokenHash },
      select: { id: true, employeeId: true, usedAt: true, expiresAt: true },
    });
    if (!record || record.usedAt !== null || record.expiresAt <= now) return { ok: false, reason: "invalid" } as const;

    const emp = await tx.employee.findFirst({
      where: { id: record.employeeId, deletedAt: null },
      select: {
        id: true,
        employeeNumber: true,
        birthDate: true,
        employmentStatus: true,
        essAccessStatus: true,
        ...LINK_EMAIL_SELECT,
      },
    });
    if (!emp) return { ok: false, reason: "invalid" } as const;
    if (isSeparated(emp.employmentStatus)) return { ok: false, reason: "separated" } as const;
    if (emp.essAccessStatus !== "ACTIVE") return { ok: false, reason: "not_active" } as const;
    const problem = pinProblem(pin, { birthDate: emp.birthDate, employeeNumber: emp.employeeNumber });
    if (problem) return { ok: false, reason: "weak_pin", message: problem } as const;
    const pinHash = await hashEssPin(pin);

    const claim = await tx.essPasswordReset.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return { ok: false, reason: "invalid" } as const;

    await tx.employee.update({
      where: { id: emp.id },
      data: { essPin: pinHash, essPasswordHash: null, essFailedAttempts: 0, essLockedUntil: null },
    });
    await endAllEssSessions(tx, emp.id, now);
    await retireResets(tx, emp.id, now);
    return { ok: true, employeeId: emp.id, email: essLinkEmail(emp) } as const;
  });
}
