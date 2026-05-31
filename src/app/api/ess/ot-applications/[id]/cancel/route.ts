/**
 * POST /api/ess/ot-applications/[id]/cancel
 *
 * Employee cancels their own PENDING OT application.
 * Only PENDING applications may be cancelled.
 * The application must belong to the authenticated employee.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, err, notFound, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const ota = await tx.oTApplication.findFirst({
        where: { id, tenantId: ctx.tenantId, employeeId: ctx.employeeId },
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
  } catch (e) {
    console.error("[ess/ot-applications/cancel]", e);
    return serverError(e);
  }
}
