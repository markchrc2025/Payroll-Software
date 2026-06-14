/**
 * GET    /api/job-levels/[id] — Get single job level
 * PATCH  /api/job-levels/[id] — Update fields
 * DELETE /api/job-levels/[id] — Soft-delete (409 if employees assigned)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rank: z.coerce.number().int().min(0).max(9999).optional(),
  description: z.string().max(500).nullable().optional(),
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
    tx.jobLevel.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    })
  );

  if (!row) return notFound("Level not found");
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
    const existing = await tx.jobLevel.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return { notFound: true as const };

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const dup = await tx.jobLevel.findFirst({
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
      row: await tx.jobLevel.update({ where: { id }, data: parsed.data }),
    };
  });

  if (result.notFound) return notFound("Level not found");
  if (result.conflict) return err("Level name already taken", 409);
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
    const existing = await tx.jobLevel.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    });
    if (!existing) return { notFound: true as const };
    if (existing._count.employees > 0)
      return { inUse: true as const };

    return {
      notFound: false as const,
      inUse: false as const,
      row: await tx.jobLevel.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    };
  });

  if (result.notFound) return notFound("Level not found");
  if (result.inUse)
    return err("Cannot delete: employees are assigned to this level", 409);
  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "DELETE",
    entity: "JobLevel",
    entityId: id,
    ipAddress: getClientIp(req),
  });
  return ok({ id }, "Level deleted");
}
