/**
 * GET    /api/kiosks/[id]  — get a single kiosk
 * PATCH  /api/kiosks/[id]  — update name, branch, or settings
 * DELETE /api/kiosks/[id]  — soft-delete
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";

const patchSchema = z.object({
  name:           z.string().min(1).max(150).optional(),
  branchId:       z.string().cuid().nullable().optional(),
  requiresSelfie: z.boolean().optional(),
  isActive:       z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const kiosk = await withTenant(auth.tenantId, (tx) =>
    tx.kiosk.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: { branch: { select: { id: true, name: true } } },
    }),
  );
  if (!kiosk) return notFound("Kiosk not found");
  return ok(kiosk);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.kiosk.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return "NOT_FOUND" as const;

    if (d.branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: d.branchId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) return "BRANCH_NOT_FOUND" as const;
    }

    return tx.kiosk.update({
      where: { id },
      data: {
        ...(d.name           !== undefined && { name: d.name }),
        ...(d.branchId       !== undefined && { branchId: d.branchId }),
        ...(d.requiresSelfie !== undefined && { requiresSelfie: d.requiresSelfie }),
        ...(d.isActive       !== undefined && { isActive: d.isActive }),
      },
    });
  });

  if (result === "NOT_FOUND")        return notFound("Kiosk not found");
  if (result === "BRANCH_NOT_FOUND") return err("Branch not found", 404);
  return ok(result);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.kiosk.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return "NOT_FOUND" as const;
    return tx.kiosk.update({ where: { id }, data: { deletedAt: new Date() } });
  });

  if (result === "NOT_FOUND") return notFound("Kiosk not found");
  return ok({ id: result.id }, "Kiosk deleted");
}
