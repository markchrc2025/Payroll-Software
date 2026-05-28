/**
 * GET  /api/roles — List roles for the current tenant.
 * POST /api/roles — Create a custom role.
 *
 * Default (isSystem=true) roles are read-only and cannot be deleted/modified.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, serverError } from "@/lib/api-response";
import { z } from "zod";

const createRoleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(255).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/roles
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "ROLES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  try {
    const roles = await withTenant(auth.tenantId, (tx) =>
      tx.role.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        include: {
          _count: { select: { permissions: true } },
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      })
    );

    const data = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: r._count.permissions,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return ok(data);
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /api/roles
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ROLES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const body = createRoleSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Invalid request body", 400, body.error.flatten());

  try {
    const role = await withTenant(auth.tenantId, async (tx) => {
      // Check for name collision (active roles only)
      const existing = await tx.role.findFirst({
        where: { tenantId: auth.tenantId, name: body.data.name, deletedAt: null },
      });
      if (existing) {
        throw Object.assign(new Error("Role name already exists"), { code: "CONFLICT" });
      }

      return tx.role.create({
        data: {
          tenantId: auth.tenantId,
          name: body.data.name,
          description: body.data.description ?? null,
          isSystem: false,
        },
        include: { _count: { select: { permissions: true } } },
      });
    });

    return ok(
      {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissionCount: role._count.permissions,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
      "Role created",
      201
    );
  } catch (e: unknown) {
    if (e instanceof Error && (e as NodeJS.ErrnoException & { code?: string }).code === "CONFLICT") {
      return err("A role with that name already exists", 409);
    }
    return serverError(e);
  }
}
