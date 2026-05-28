/**
 * getSuperAdminContext — server-side helper for SUPER_ADMIN-only routes.
 *
 * Returns the user's ID if they are authenticated as SUPER_ADMIN.
 * Unlike getAuthContext, this does NOT require a tenantId (SUPER_ADMIN users
 * have tenantId = null in the session).
 *
 * Returns null if unauthenticated or not SUPER_ADMIN.
 */
import { auth } from "@/auth";

export type SuperAdminContext = {
  userId: string;
};

export async function getSuperAdminContext(): Promise<SuperAdminContext | null> {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.systemRole !== "SUPER_ADMIN") return null;
  return { userId: session.user.id };
}
