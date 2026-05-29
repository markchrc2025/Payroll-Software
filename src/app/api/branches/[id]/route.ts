/**
 * GET    /api/branches/[id] — Get single branch with geofence
 * PATCH  /api/branches/[id] — Update fields
 * DELETE /api/branches/[id] — Soft-delete (409 if employees assigned)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  workLocationId: z.string().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  zipCode: z.string().max(10).nullable().optional(),
  isHeadOffice: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.branch.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: {
        workLocation: { select: { id: true, name: true, region: true } },
        geofences: { where: { deletedAt: null } },
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
    })
  );

  if (!row) return notFound("Branch not found");
  return ok(row);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.branch.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return { notFound: true as const };

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const dup = await tx.branch.findFirst({
        where: {
          tenantId: auth.tenantId,
          name: { equals: parsed.data.name, mode: "insensitive" },
          deletedAt: null,
          NOT: { id },
        },
      });
      if (dup) return { conflict: true as const };
    }

    return {
      notFound: false as const,
      conflict: false as const,
      row: await tx.branch.update({ where: { id }, data: parsed.data }),
    };
  });

  if (result.notFound) return notFound("Branch not found");
  if (result.conflict) return err("Branch name already taken", 409);
  return ok(result.row);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.branch.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    });
    if (!existing) return { notFound: true as const };
    if (existing._count.employees > 0)
      return { inUse: true as const };

    return {
      notFound: false as const,
      inUse: false as const,
      row: await tx.branch.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    };
  });

  if (result.notFound) return notFound("Branch not found");
  if (result.inUse)
    return err("Cannot delete: employees are assigned to this branch", 409);
  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "DELETE",
    entity: "Branch",
    entityId: id,
    ipAddress: getClientIp(req),
  });
  return ok({ id }, "Branch deleted");
}
