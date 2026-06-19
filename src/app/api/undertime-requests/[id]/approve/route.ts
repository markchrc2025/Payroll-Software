/**
 * POST /api/undertime-requests/[id]/approve
 *
 * PENDING → APPROVED. Idempotent: re-approving an APPROVED request returns 200.
 *
 * Note: approval EXCUSES the undertime — it does NOT write minutes onto the DTR.
 * The aggregator subtracts approved undertime minutes from the deductible total,
 * so an approved early-departure is not deducted from pay. Only unfiled /
 * unapproved undertime is deducted.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const utr = await tx.undertimeRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!utr) return { notFound: true as const };
    if (utr.status === "REJECTED" || utr.status === "CANCELLED")
      return { terminal: true as const, status: utr.status };

    const now = new Date();
    const updated = await tx.undertimeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: auth.userId,
        approvedAt: utr.approvedAt ?? now,
      },
    });

    return { notFound: false as const, terminal: false as const, row: updated };
  });

  if (result.notFound) return notFound("Undertime request not found");
  if (result.terminal)
    return err(`Cannot approve a ${result.status} request`, 409);

  return ok(result.row, "Undertime request approved");
}
