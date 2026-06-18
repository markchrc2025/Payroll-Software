/**
 * GET    /api/positions/[id] — Get single position
 * PATCH  /api/positions/[id] — Update fields
 * DELETE /api/positions/[id] — Soft-delete (409 if employees assigned)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const LEVEL_SELECT = { id: true, name: true, rank: true };

const patchSchema = z.object({
  title:        z.string().min(1).max(150).optional(),
  levelId:      z.string().min(1).optional().nullable(),
  description:  z.string().max(500).nullable().optional(),
  departmentId: z.string().cuid().optional().nullable(),
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
    tx.position.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: {
        level: { select: LEVEL_SELECT },
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
    })
  );

  if (!row) return notFound("Position not found");
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
    const existing = await tx.position.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return { notFound: true as const };

    if (parsed.data.title && parsed.data.title !== existing.title) {
      const dup = await tx.position.findFirst({
        where: {
          tenantId: auth.tenantId,
          title: { equals: parsed.data.title, mode: "insensitive" },
          deletedAt: null,
          NOT: { id },
        },
      });
      if (dup) return { conflict: true as const };
    }

    return {
      notFound: false as const,
      conflict: false as const,
      row: await tx.position.update({
        where: { id },
        data:  parsed.data,
        select: {
          id: true, title: true, levelId: true,
          level: { select: LEVEL_SELECT },
          description: true, departmentId: true,
          department: { select: { id: true, name: true } },
        },
      }),
    };
  });

  if (result.notFound) return notFound("Position not found");
  if (result.conflict) return err("Position title already taken", 409);
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
    const existing = await tx.position.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    });
    if (!existing) return { notFound: true as const };
    if (existing._count.employees > 0)
      return { inUse: true as const };

    return {
      notFound: false as const,
      inUse: false as const,
      row: await tx.position.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    };
  });

  if (result.notFound) return notFound("Position not found");
  if (result.inUse)
    return err("Cannot delete: employees are assigned to this position", 409);
  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "DELETE",
    entity: "Position",
    entityId: id,
    ipAddress: getClientIp(req),
  });
  return ok({ id }, "Position deleted");
}
