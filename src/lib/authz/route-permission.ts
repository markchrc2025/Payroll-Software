/**
 * Unit 0.25 (approved by Mark on 10 Nov 2026): every tenant API handler checks
 * the caller's ROLE, not just that they are signed in.
 *
 * Mark's data-privacy rule: seeing records with authority is not a breach;
 * seeing them without authority is. Before this unit, 108 handlers in 70 route
 * files checked only sign-in, so role customization did nothing there: a
 * dashboard user given a narrow role (a timekeeper, a department head) could
 * still download BIR 1601-C, 2316 and the alphalist, every employee's pay and
 * government IDs, edit approval chains, and approve salary movements.
 *
 * `forbidUnless` is for handlers that already resolved `auth` with
 * getAuthContext (most of them): one line after the sign-in check, without
 * rewriting the handler. It passes SUPER_ADMIN, then any ONE of the listed
 * permissions. The company owner passes through their Administrator role, which
 * holds every permission (src/app/api/admin/tenants/route.ts).
 *
 * The CI test src/__tests__/u25-route-permissions.test.ts fails any tenant
 * handler that has neither a permission check nor an `@permission-exempt:`
 * comment giving the reason.
 */
import type { PermissionAction, PermissionModule } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { forbidden } from "@/lib/api-response";
import { checkPermission } from "@/lib/require-permission";

export type Perm = readonly [PermissionModule, PermissionAction];

const NO_ROLE = "Your account has no role yet. Ask your administrator to assign one.";
const NO_PERMISSION = "Your role doesn't allow this. Ask your administrator if you need access.";

/** True when the caller holds at least one of the permissions (or is SUPER_ADMIN). */
export async function holdsAny(auth: AuthContext, perms: readonly Perm[]): Promise<boolean> {
  if (auth.systemRole === "SUPER_ADMIN") return true;
  if (!auth.roleId) return false;
  for (const [module, action] of perms) {
    if (await checkPermission(auth.tenantId, auth.roleId, module, action)) return true;
  }
  return false;
}

/** null when the caller may proceed; otherwise the 403 to return. */
export async function forbidUnless(auth: AuthContext, ...perms: Perm[]): Promise<Response | null> {
  if (auth.systemRole === "SUPER_ADMIN") return null;
  if (!auth.roleId) return forbidden(NO_ROLE);
  return (await holdsAny(auth, perms)) ? null : forbidden(NO_PERMISSION);
}
