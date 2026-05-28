/**
 * /api/leave-transactions/[id]/reject
 *   POST — reject a PENDING leave transaction
 *
 * Requires rejectionReason in body. No balance mutation.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { rejectLeaveSchema } from "@/lib/validations/leave";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = rejectLeaveSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { rejectionReason } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const txn = await tx.leaveTransaction.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!txn) return "not_found" as const;
    if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

    return tx.leaveTransaction.update({
      where: { id },
      data: {
        approvalStatus: "REJECTED",
        approvedByUserId: auth.userId,
        approvedAt: new Date(),
        rejectionReason,
      },
    });
  });

  if (result === "not_found") return notFound("LeaveTransaction");
  if (result === "not_pending") return err("Transaction is not in PENDING status", 409);
  return ok(serializeLeaveTransaction(result), "Leave request rejected");
}
