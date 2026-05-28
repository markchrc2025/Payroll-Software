/**
 * GET    /api/roles/[id] — Get role with its full permission list.
 * PATCH  /api/roles/[id] — Update name/description (custom roles only).
 * DELETE /api/roles/[id] — Soft-delete role (custom roles only; no employees assigned).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { z } from "zod";

const patchRoleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(255).nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/roles/[id]
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const role = await withTenant(auth.tenantId, (tx) =>
      tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      })
    );

    if (!role) return notFound("Role");

    return ok({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
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

// ---------------------------------------------------------------------------
// PATCH /api/roles/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = patchRoleSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Invalid request body", 400, body.error.flatten());

  if (!body.data.name && body.data.description === undefined) {
    return err("No fields to update", 400);
  }

  try {
    const updated = await withTenant(auth.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!role) return null;
      if (role.isSystem) {
        throw Object.assign(new Error("Cannot modify a system role"), { code: "SYSTEM_ROLE" });
      }

      // Name collision check (if changing name)
      if (body.data.name && body.data.name !== role.name) {
        const collision = await tx.role.findFirst({
          where: { tenantId: auth.tenantId, name: body.data.name, deletedAt: null },
        });
        if (collision) {
          throw Object.assign(new Error("Role name already exists"), { code: "CONFLICT" });
        }
      }

      return tx.role.update({
        where: { id },
        data: {
          ...(body.data.name !== undefined && { name: body.data.name }),
          ...(body.data.description !== undefined && { description: body.data.description }),
        },
        include: { _count: { select: { permissions: true } } },
      });
    });

    if (!updated) return notFound("Role");

    return ok({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      permissionCount: updated._count.permissions,
      updatedAt: updated.updatedAt,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      const code = (e as NodeJS.ErrnoException & { code?: string }).code;
      if (code === "SYSTEM_ROLE") return err("Cannot modify a system role", 403);
      if (code === "CONFLICT") return err("A role with that name already exists", 409);
    }
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/roles/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "DELETE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const result = await withTenant(auth.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        include: { _count: { select: { users: true } } },
      });
      if (!role) return "NOT_FOUND" as const;
      if (role.isSystem) return "SYSTEM_ROLE" as const;
      if (role._count.users > 0) return "HAS_USERS" as const;

      await tx.role.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return "OK" as const;
    });

    if (result === "NOT_FOUND") return notFound("Role");
    if (result === "SYSTEM_ROLE") return err("Cannot delete a system role", 403);
    if (result === "HAS_USERS") return err("Role is assigned to users — reassign or remove users first", 409);

    return ok({ id }, "Role deleted");
  } catch (e) {
    return serverError(e);
  }
}
