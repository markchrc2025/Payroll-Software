/**
 * GET    /api/assets/[id] — Get a single asset with assignment history.
 * PATCH  /api/assets/[id] — Update asset metadata.
 * DELETE /api/assets/[id] — Soft-delete an asset.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { updateAssetSchema } from "@/lib/validations/asset";
import { toCentavos, centavosToJson } from "@/lib/money";

function serializeAsset(a: Parameters<typeof centavosToJson>[0] extends null ? never : {
  purchaseCostCents: bigint | null;
  [key: string]: unknown;
}) {
  return { ...a, purchaseCostCents: centavosToJson(a.purchaseCostCents as bigint | null) };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const asset = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        assignments: {
          orderBy: { assignedAt: "desc" },
          include: {
            employee: {
              select: { id: true, employeeNumber: true, firstName: true, lastName: true },
            },
          },
        },
      },
    }),
  );

  if (!asset) return notFound("Asset");

  return ok({
    ...asset,
    purchaseCostCents: centavosToJson(asset.purchaseCostCents),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { purchaseCost, ...rest } = parsed.data;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!existing) return notFound("Asset");

  const updated = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(purchaseCost !== undefined && {
          purchaseCostCents: purchaseCost ? toCentavos(purchaseCost) : null,
        }),
      },
    }),
  );

  return ok({ ...updated, purchaseCostCents: centavosToJson(updated.purchaseCostCents) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "DELETE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!existing) return notFound("Asset");

  // Block deletion if asset is currently assigned
  const activeAssignment = await withTenant(ctx.tenantId, (tx) =>
    tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } }),
  );
  if (activeAssignment) return err("Cannot delete an asset that is currently assigned", 409);

  await withTenant(ctx.tenantId, (tx) =>
    tx.asset.update({ where: { id }, data: { deletedAt: new Date() } }),
  );

  return ok({ id }, "Asset deleted");
}
