/**
 * DELETE /api/roles/[id]/permissions/[permId] — Revoke a permission from a role.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound, serverError } from "@/lib/api-response";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; permId: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id, permId } = await params;

  try {
    const result = await withTenant(auth.tenantId, async (tx) => {
      // Verify role belongs to tenant
      const role = await tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!role) return "ROLE_NOT_FOUND" as const;

      const rp = await tx.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: id, permissionId: permId } },
      });
      if (!rp) return "NOT_FOUND" as const;

      await tx.rolePermission.delete({
        where: { roleId_permissionId: { roleId: id, permissionId: permId } },
      });

      return "OK" as const;
    });

    if (result === "ROLE_NOT_FOUND") return notFound("Role");
    if (result === "NOT_FOUND") return notFound("RolePermission");

    return ok({ roleId: id, permissionId: permId }, "Permission revoked");
  } catch (e) {
    return serverError(e);
  }
}
