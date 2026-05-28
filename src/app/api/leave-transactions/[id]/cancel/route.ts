/**
 * /api/leave-transactions/[id]/cancel
 *   POST — cancel a PENDING leave transaction
 *
 * Only PENDING transactions can be cancelled. No balance mutation.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const txn = await tx.leaveTransaction.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!txn) return "not_found" as const;
    if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

    return tx.leaveTransaction.update({
      where: { id },
      data: { approvalStatus: "CANCELLED" },
    });
  });

  if (result === "not_found") return notFound("LeaveTransaction");
  if (result === "not_pending") return err("Only PENDING transactions can be cancelled", 409);
  return ok(serializeLeaveTransaction(result), "Leave request cancelled");
}
