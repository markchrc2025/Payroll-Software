/**
 * GET /api/employees/[id]/effective-permissions
 *
 * Returns the effective permission set for an employee (via their linked User
 * account and that user's assigned Role). If the employee has no linked user
 * or the user has no role, an empty array is returned.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound, serverError } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const result = await withTenant(auth.tenantId, async (tx) => {
      // Verify employee belongs to tenant
      const employee = await tx.employee.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true, userId: true },
      });
      if (!employee) return null;

      // No linked user → no permissions
      if (!employee.userId) {
        return { employee: { id: employee.id }, roleId: null, permissions: [] };
      }

      const user = await tx.user.findUnique({
        where: { id: employee.userId },
        select: {
          id: true,
          roleId: true,
          systemRole: true,
          assignedRole: {
            select: {
              id: true,
              name: true,
              isSystem: true,
              permissions: {
                include: { permission: true },
                orderBy: [
                  { permission: { module: "asc" } },
                  { permission: { action: "asc" } },
                ],
              },
            },
          },
        },
      });

      if (!user) {
        return { employee: { id: employee.id }, roleId: null, permissions: [] };
      }

      // SUPER_ADMIN — conceptually all permissions (indicate via flag)
      if (user.systemRole === "SUPER_ADMIN") {
        return {
          employee: { id: employee.id },
          roleId: null,
          isSuperAdmin: true,
          permissions: [],
        };
      }

      const permissions = user.assignedRole?.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
        label: rp.permission.label,
      })) ?? [];

      return {
        employee: { id: employee.id },
        roleId: user.roleId,
        role: user.assignedRole
          ? { id: user.assignedRole.id, name: user.assignedRole.name, isSystem: user.assignedRole.isSystem }
          : null,
        isSuperAdmin: false,
        permissions,
      };
    });

    if (!result) return notFound("Employee");

    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}
