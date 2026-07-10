/**
 * Auth Context — server-side helper used by every API route and Server Component.
 *
 * Reads the NextAuth v5 JWT session and returns the caller's tenant scope
 * (tenantId) plus identity (userId, systemRole). Returns null if not signed in.
 *
 * Multi-tenancy contract: every Prisma query MUST be filtered by `tenantId`
 * (Phase C adds Postgres RLS as a defense-in-depth layer on top).
 */
import { auth } from "@/auth";
import prismaAdmin from "@/lib/prisma-admin";
import type { SystemRole } from "@prisma/client";

export type AuthContext = {
  tenantId: string;
  userId: string;
  systemRole: SystemRole;
  roleId: string | null;
};

export async function getAuthContext(
  _req?: unknown
): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const { id, tenantId, systemRole, roleId } = session.user;
  if (!id || !tenantId) return null; // SUPER_ADMIN tenant guard + defend against
  // a malformed token: with strictUndefinedChecks off, an `id: undefined`
  // filter would be stripped and match an arbitrary tenant user.

  // Re-validate against the live account: an 8h JWT must not outlive a user
  // being deactivated or removed from their tenant. Keyed by primary id, so
  // this is a single indexed lookup.
  const user = await prismaAdmin.user.findFirst({
    where: { id, tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!user) return null;

  return {
    userId: id,
    tenantId,
    systemRole,
    roleId,
  };
}
