/**
 * POST /api/ot-applications/[id]/cancel
 *
 * PENDING → CANCELLED. Only PENDING applications may be cancelled.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const ota = await tx.oTApplication.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!ota) return { notFound: true as const };
    if (ota.status !== "PENDING")
      return { notPending: true as const, status: ota.status };

    const updated = await tx.oTApplication.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return { notFound: false as const, notPending: false as const, row: updated };
  });

  if (result.notFound) return notFound("OT application not found");
  if (result.notPending)
    return err(`Cannot cancel a ${result.status} application`, 409);
  return ok(result.row, "OT application cancelled");
}
