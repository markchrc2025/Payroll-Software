/**
 * Auth Context — server-side helper used by every API route and Server Component.
 *
 * Reads the NextAuth v5 JWT session and returns the caller's tenant scope
 * (companyId) plus identity (userId, systemRole). Returns null if not signed in.
 *
 * Multi-tenancy contract: every Prisma query MUST be filtered by `companyId`.
 */
import { auth } from "@/auth";
import type { SystemRole } from "@prisma/client";

export type AuthContext = {
  companyId: string;
  userId: string;
  systemRole: SystemRole;
  roleId: string | null;
};

/**
 * Returns the current auth context, or null if the request is unauthenticated.
 * SUPER_ADMIN users (no companyId) are intentionally rejected from tenant-scoped
 * routes — they should use dedicated admin endpoints in a later phase.
 *
 * The optional `_req` parameter is accepted for backward compatibility with
 * existing callers that pass `NextRequest`; it is unused (session is read from
 * cookies via NextAuth's `auth()` helper).
 */
export async function getAuthContext(
  _req?: unknown
): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const { id, companyId, systemRole, roleId } = session.user;
  if (!companyId) return null; // SUPER_ADMIN tenant guard

  return {
    userId: id,
    companyId,
    systemRole,
    roleId,
  };
}
