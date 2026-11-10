/**
 * Dashboard and Central sign-in lockout (unit 0.15 Amendment 4, Mark's ruling
 * of 10 Nov 2026: "same lockout added to dashboard sign-in").
 *
 * Five wrong passwords in a row lock an account's sign-in for 15 minutes. The
 * lock lifts by itself, or at once when the user uses a reset link. A success
 * clears the count. Same rule as ESS (src/lib/ess-lockout.ts).
 *
 * The count moves with an atomic increment; the fifth (or later, if two
 * attempts race) sets the lock and starts the count again.
 */
// Imported from @auth/core (what next-auth re-exports) so tests that mock the
// next-auth runtime keep working.
import { CredentialsSignin } from "@auth/core/errors";
import prismaAdmin from "@/lib/prisma-admin";

export const USER_MAX_FAILED_LOGINS = 5;
export const USER_LOCK_MS = 15 * 60 * 1000;

/** Thrown from authorize(): client-safe, reaches the login screen as code "locked". */
export class AccountLockedSignin extends CredentialsSignin {
  code = "locked";
}

export const isLocked = (u: { lockedUntil: Date | null }, now = new Date()) =>
  !!u.lockedUntil && u.lockedUntil > now;

/** Count one wrong password. Returns true if this attempt locked the account. */
export async function recordUserLoginFailure(userId: string, now = new Date()): Promise<boolean> {
  const { failedLoginCount } = await prismaAdmin.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (!(typeof failedLoginCount === "number" && failedLoginCount >= USER_MAX_FAILED_LOGINS)) return false;
  await prismaAdmin.user.update({
    where: { id: userId },
    data: { lockedUntil: new Date(now.getTime() + USER_LOCK_MS), failedLoginCount: 0 },
  });
  return true;
}
