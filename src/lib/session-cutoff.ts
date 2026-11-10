/**
 * Unit 0.15 Amendment 2 (ruling B8): end HR/admin and Central sessions when
 * the password changes.
 *
 * Tenant and Central sessions are stateless Auth.js JWTs (8 hours), so there is
 * no row to revoke. Instead every token carries `signedInAt` (set once, at
 * sign-in, never refreshed) and every request re-checks the user:
 *   - the account still exists and is active (a deactivated or deleted user
 *     loses their session at once, not up to 8 hours later);
 *   - the session was signed in AFTER `User.sessionsValidAfter`, which is set
 *     whenever a password is changed or reset.
 * Returning false makes the jwt callback return null, which clears the cookie.
 *
 * FAIL CLOSED: if the lookup itself fails, the session is treated as invalid.
 */
import prismaAdmin from "@/lib/prisma-admin";

export type CutoffToken = { userId?: string; signedInAt?: number };

export async function sessionStillValid(token: CutoffToken): Promise<boolean> {
  if (!token.userId) return false;
  try {
    const u = await prismaAdmin.user.findUnique({
      where: { id: token.userId },
      select: { isActive: true, deletedAt: true, sessionsValidAfter: true },
    });
    if (!u || !u.isActive || u.deletedAt !== null) return false;
    if (u.sessionsValidAfter && (token.signedInAt ?? 0) < u.sessionsValidAfter.getTime()) return false;
    return true;
  } catch (e) {
    console.error("[session-cutoff] lookup failed, ending the session:", e);
    return false;
  }
}
