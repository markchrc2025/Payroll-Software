/**
 * POST /api/ess/undertime/[id]/cancel
 *
 * Employee cancels their own PENDING undertime request.
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
      const req = await tx.undertimeRequest.findFirst({
        where: { id, tenantId: ctx.tenantId, employeeId: ctx.employeeId },
      });
      if (!req) return { notFound: true as const };
      if (req.status !== "PENDING")
        return { notPending: true as const, status: req.status };

      const updated = await tx.undertimeRequest.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return { notFound: false as const, notPending: false as const, row: updated };
    });

    if (result.notFound) return notFound("Undertime request not found");
    if (result.notPending)
      return err(`Cannot cancel a ${result.status} request`, 409);

    return ok(result.row, "Undertime request cancelled");
  } catch (e) {
    console.error("[ess/undertime/cancel]", e);
    return serverError(e);
  }
}
