/**
 * requirePermission — RBAC route guard for admin API routes.
 *
 * Usage in a route handler:
 *
 *   export async function POST(req: NextRequest) {
 *     const guard = await requirePermission(req, "PAYROLL", "CREATE");
 *     if (guard instanceof Response) return guard;
 *     const { ctx } = guard;
 *     // ... handler body using ctx.tenantId etc.
 *   }
 *
 * SUPER_ADMIN system role bypasses all permission checks.
 * Users with no role assigned (roleId === null) are always denied unless SUPER_ADMIN.
 */
import type { NextRequest } from "next/server";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { forbidden, unauthorized } from "@/lib/api-response";

/**
 * Pure DB check — testable without an HTTP request.
 * Returns true when the role has the given (module, action) permission for the tenant.
 */
export async function checkPermission(
  tenantId: string,
  roleId: string,
  module: PermissionModule,
  action: PermissionAction,
): Promise<boolean> {
  const result = await withTenant(tenantId, (tx) =>
    tx.rolePermission.findFirst({
      where: {
        roleId,
        permission: { module, action },
      },
    }),
  );
  return result !== null;
}

/**
 * Route guard — returns `{ ctx }` on success or a Response (401/403) on failure.
 *
 * - 401 when no valid session is present.
 * - 403 when authenticated but lacking the required permission.
 */
export async function requirePermission(
  req: NextRequest,
  module: PermissionModule,
  action: PermissionAction,
): Promise<{ ctx: AuthContext } | Response> {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  // SUPER_ADMIN bypasses all tenant-level permission checks
  if (ctx.systemRole === "SUPER_ADMIN") return { ctx };

  if (!ctx.roleId) return forbidden();

  const allowed = await checkPermission(ctx.tenantId, ctx.roleId, module, action);
  if (!allowed) return forbidden();

  return { ctx };
}
