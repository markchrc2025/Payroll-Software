/**
 * GET    /api/admin/central-roles/[id] — role + its permissions (ROLES:READ).
 * PATCH  /api/admin/central-roles/[id] — rename/describe a custom role (ROLES:MANAGE).
 * DELETE /api/admin/central-roles/[id] — soft-delete a custom role (ROLES:MANAGE).
 *
 * The built-in "Super Admin" role (isSystem = true) cannot be modified or
 * deleted. A role that still has admins assigned cannot be deleted.
 */
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(255).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("ROLES", "READ");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  try {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id, deletedAt: null },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) return notFound("Role");

    return ok({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
        label: rp.permission.label,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("ROLES", "MANAGE");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid request body", 422, parsed.error.flatten());
  if (parsed.data.name === undefined && parsed.data.description === undefined) {
    return err("No fields to update", 400);
  }

  try {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, isSystem: true, name: true },
    });
    if (!role) return notFound("Role");
    if (role.isSystem) return err("Cannot modify a system role", 403);

    const nextName = parsed.data.name?.trim();
    if (nextName && nextName !== role.name) {
      const collision = await prismaAdmin.centralRole.findFirst({
        where: { name: nextName, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (collision) return err("A role with that name already exists", 409);
    }

    const updated = await prismaAdmin.centralRole.update({
      where: { id },
      data: {
        ...(nextName !== undefined && { name: nextName }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description?.trim() || null,
        }),
      },
      include: { _count: { select: { permissions: true, users: true } } },
    });

    return ok({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      permissionCount: updated._count.permissions,
      userCount: updated._count.users,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("ROLES", "MANAGE");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  try {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });
    if (!role) return notFound("Role");
    if (role.isSystem) return err("Cannot delete a system role", 403);
    if (role._count.users > 0) {
      return err("Role is assigned to admins — reassign them first", 409);
    }

    await prismaAdmin.centralRole.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok({ id }, "Role deleted");
  } catch (e) {
    return serverError(e);
  }
}
