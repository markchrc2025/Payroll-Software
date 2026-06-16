/**
 * GET  /api/roles/[id]/permissions — List permissions assigned to a role.
 * POST /api/roles/[id]/permissions — Assign a permission to a role (idempotent).
 * PUT  /api/roles/[id]/permissions — Replace the whole permission set in one call.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { z } from "zod";

const assignPermissionSchema = z.object({
  permissionId: z.string().min(1),
});

const replacePermissionsSchema = z.object({
  permissionIds: z.array(z.string().min(1)),
});

// ---------------------------------------------------------------------------
// GET /api/roles/[id]/permissions
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
            orderBy: [
              { permission: { module: "asc" } },
              { permission: { action: "asc" } },
            ],
          },
        },
      })
    );

    if (!role) return notFound("Role");

    return ok(
      role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
        label: rp.permission.label,
      }))
    );
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /api/roles/[id]/permissions
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = assignPermissionSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Invalid request body", 400, body.error.flatten());

  try {
    const result = await withTenant(auth.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!role) return "NOT_FOUND" as const;

      // Verify permission exists in global catalog
      const permission = await tx.permission.findUnique({
        where: { id: body.data.permissionId },
      });
      if (!permission) return "PERM_NOT_FOUND" as const;

      // Idempotent upsert
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: id, permissionId: body.data.permissionId },
        },
        create: { roleId: id, permissionId: body.data.permissionId },
        update: {},
      });

      return permission;
    });

    if (result === "NOT_FOUND") return notFound("Role");
    if (result === "PERM_NOT_FOUND") return notFound("Permission");

    return ok(
      {
        roleId: id,
        permission: {
          id: result.id,
          module: result.module,
          action: result.action,
          label: result.label,
        },
      },
      "Permission assigned",
      201
    );
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/roles/[id]/permissions
// Replace a role's full permission set in a single request. Keeps the
// checkbox-matrix editor simple (no per-toggle round-trips). System roles
// (e.g. the built-in Administrator) are read-only.
// ---------------------------------------------------------------------------
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "ROLES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = replacePermissionsSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Invalid request body", 400, body.error.flatten());

  try {
    const result = await withTenant(auth.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true, isSystem: true },
      });
      if (!role) return "NOT_FOUND" as const;
      if (role.isSystem) return "SYSTEM_ROLE" as const;

      // Only accept ids that exist in the global catalog (drop unknown ids).
      const valid = await tx.permission.findMany({
        where: { id: { in: body.data.permissionIds } },
        select: { id: true },
      });
      const validIds = valid.map((p) => p.id);

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (validIds.length > 0) {
        await tx.rolePermission.createMany({
          data: validIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }

      return validIds.length;
    });

    if (result === "NOT_FOUND") return notFound("Role");
    if (result === "SYSTEM_ROLE") return err("Cannot modify a system role's permissions", 403);

    return ok({ roleId: id, permissionCount: result }, "Permissions updated");
  } catch (e) {
    return serverError(e);
  }
}
