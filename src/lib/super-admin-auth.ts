/**
 * getSuperAdminContext — server-side helper for SUPER_ADMIN-only routes.
 *
 * Returns the user's ID if they are authenticated as SUPER_ADMIN.
 * Unlike getAuthContext, this does NOT require a tenantId (SUPER_ADMIN users
 * have tenantId = null in the session).
 *
 * The JWT alone is not trusted for authorization: because sessions live up to
 * 8h, we re-validate the account against the DB on every call so that a
 * deactivated or soft-deleted admin loses access on their next request rather
 * than when their token eventually expires.
 *
 * Returns null if unauthenticated, not SUPER_ADMIN, inactive, or deleted.
 */
import { auth } from "@/auth";
import prismaAdmin from "@/lib/prisma-admin";

export type SuperAdminContext = {
  userId: string;
};

export async function getSuperAdminContext(): Promise<SuperAdminContext | null> {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.systemRole !== "SUPER_ADMIN") return null;

  // Re-check the live account state — the JWT claim is not sufficient.
  const user = await prismaAdmin.user.findFirst({
    where: {
      id: session.user.id,
      systemRole: "SUPER_ADMIN",
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!user) return null;

  return { userId: user.id };
}
