/**
 * POST /api/assets/[id]/return — Mark an assigned asset as returned.
 *
 * Updates the active assignment's returnedAt + conditionAtReturn,
 * then sets asset status back to AVAILABLE (or UNDER_REPAIR/DAMAGED as needed).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { returnAssetSchema } from "@/lib/validations/asset";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = returnAssetSchema.safeParse(body ?? {});
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { conditionAtReturn, returnNotes } = parsed.data;

  const asset = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!asset) return notFound("Asset");

  const activeAssignment = await withTenant(ctx.tenantId, (tx) =>
    tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } }),
  );
  if (!activeAssignment) return err("Asset has no active assignment to return.", 409);

  // Determine new asset status based on return condition
  const returnCondition = conditionAtReturn ?? "GOOD";
  const newStatus =
    returnCondition === "DAMAGED" || returnCondition === "POOR" ? "UNDER_REPAIR" : "AVAILABLE";

  const [assignment] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.assetAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          returnedAt: new Date(),
          conditionAtReturn: returnCondition,
          returnNotes: returnNotes ?? null,
          returnedByUserId: ctx.userId,
        },
      }),
      tx.asset.update({
        where: { id },
        data: { status: newStatus, condition: returnCondition },
      }),
    ]),
  );

  return ok(assignment, "Asset returned");
}
