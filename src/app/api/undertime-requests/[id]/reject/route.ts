/**
 * POST /api/undertime-requests/[id]/reject
 *
 * PENDING | APPROVED → REJECTED. rejectionReason is required.
 *
 * Rejecting an approved request removes the excuse: the day's undertime
 * becomes deductible again (the aggregator only excuses APPROVED requests).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required").max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const utr = await tx.undertimeRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!utr) return { notFound: true as const };
    if (utr.status !== "PENDING" && utr.status !== "APPROVED")
      return { notRejectable: true as const, status: utr.status };

    const updated = await tx.undertimeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: auth.userId,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
      },
    });

    return { notFound: false as const, notRejectable: false as const, row: updated };
  });

  if (result.notFound) return notFound("Undertime request not found");
  if (result.notRejectable)
    return err(`Cannot reject a ${result.status} request`, 409);
  return ok(result.row, "Undertime request rejected");
}
