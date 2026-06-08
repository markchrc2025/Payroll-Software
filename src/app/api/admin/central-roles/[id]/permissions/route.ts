/**
 * GET /api/admin/central-roles/[id]/permissions — list a role's permissions (ROLES:READ).
 * PUT /api/admin/central-roles/[id]/permissions — replace the whole set (ROLES:MANAGE).
 *
 * PUT body: { permissionIds: string[] }. Replacing the full set keeps the
 * checkbox-grid editor simple (no per-toggle round-trips). The built-in
 * Super Admin role's permissions are fixed and cannot be edited.
 */
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { z } from "zod";

const putSchema = z.object({
  permissionIds: z.array(z.string().min(1)),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("ROLES", "READ");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  try {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id, deletedAt: null },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: [{ permission: { module: "asc" } }, { permission: { action: "asc" } }],
        },
      },
    });
    if (!role) return notFound("Role");

    return ok(
      role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
        label: rp.permission.label,
      })),
    );
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("ROLES", "MANAGE");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid request body", 422, parsed.error.flatten());

  try {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, isSystem: true },
    });
    if (!role) return notFound("Role");
    if (role.isSystem) return err("Cannot modify a system role's permissions", 403);

    // Only accept ids that exist in the catalog (ignore stray/unknown ids).
    const valid = await prismaAdmin.centralPermission.findMany({
      where: { id: { in: parsed.data.permissionIds } },
      select: { id: true },
    });
    const validIds = valid.map((p) => p.id);

    await prismaAdmin.$transaction([
      prismaAdmin.centralRolePermission.deleteMany({ where: { centralRoleId: id } }),
      prismaAdmin.centralRolePermission.createMany({
        data: validIds.map((permissionId) => ({
          centralRoleId: id,
          centralPermissionId: permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return ok({ roleId: id, permissionCount: validIds.length }, "Permissions updated");
  } catch (e) {
    return serverError(e);
  }
}
