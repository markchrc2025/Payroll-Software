/**
 * GET  /api/admin/central-roles — list Central Portal roles (ROLES:READ).
 * POST /api/admin/central-roles — create a custom role (ROLES:MANAGE).
 *
 * The built-in "Super Admin" role (isSystem = true) is read-only and cannot be
 * deleted or modified.
 */
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { z } from "zod";

const createRoleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(255).optional(),
});

export async function GET() {
  const ctx = await requireCentralPermission("ROLES", "READ");
  if (ctx instanceof Response) return ctx;

  try {
    const roles = await prismaAdmin.centralRole.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { permissions: true, users: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return ok(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissionCount: r._count.permissions,
        userCount: r._count.users,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const ctx = await requireCentralPermission("ROLES", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const parsed = createRoleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid request body", 422, parsed.error.flatten());

  const name = parsed.data.name.trim();

  try {
    // Name uniqueness among live roles (soft-deleted names may be reused).
    const existing = await prismaAdmin.centralRole.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });
    if (existing) return err("A role with that name already exists", 409);

    const role = await prismaAdmin.centralRole.create({
      data: { name, description: parsed.data.description?.trim() || null, isSystem: false },
      include: { _count: { select: { permissions: true, users: true } } },
    });

    return ok(
      {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissionCount: role._count.permissions,
        userCount: role._count.users,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      },
      "Role created",
      201,
    );
  } catch (e) {
    return serverError(e);
  }
}
