/**
 * GET    /api/work-locations/[id] — Get single work location
 * PATCH  /api/work-locations/[id] — Update fields
 * DELETE /api/work-locations/[id] — Soft-delete (403 if branches assigned)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  region: z.string().min(1).max(20).optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  zipCode: z.string().max(10).nullable().optional(),
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
    tx.workLocation.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { branches: { where: { deletedAt: null } } } } },
    })
  );

  if (!row) return notFound("Work location not found");
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
    const existing = await tx.workLocation.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return { notFound: true as const };

    // Duplicate name check (excluding self)
    if (parsed.data.name && parsed.data.name !== existing.name) {
      const dup = await tx.workLocation.findFirst({
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
      row: await tx.workLocation.update({ where: { id }, data: parsed.data }),
    };
  });

  if (result.notFound) return notFound("Work location not found");
  if (result.conflict) return err(`Name already taken`, 409);
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
    const existing = await tx.workLocation.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { _count: { select: { branches: { where: { deletedAt: null } } } } },
    });
    if (!existing) return { notFound: true as const };
    if (existing._count.branches > 0)
      return { inUse: true as const };

    return {
      notFound: false as const,
      inUse: false as const,
      row: await tx.workLocation.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    };
  });

  if (result.notFound) return notFound("Work location not found");
  if (result.inUse)
    return err("Cannot delete: active branches are assigned to this work location", 409);
  return ok({ id }, "Work location deleted");
}
