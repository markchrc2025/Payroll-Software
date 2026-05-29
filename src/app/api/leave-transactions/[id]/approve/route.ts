/**
 * /api/leave-transactions/[id]/approve
 *   POST — approve a PENDING leave transaction
 *
 * On approval: status → APPROVED, LeaveBalance.used += amount.
 * Idempotent: re-approving an already-APPROVED transaction returns 200 without
 * double-debiting the balance.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { writeAuditLog, getClientIp } from "@/lib/audit";

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
    if (txn.type !== "USAGE") return "wrong_type" as const;

    // Idempotent — already approved
    if (txn.approvalStatus === "APPROVED") return txn;

    if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

    // Approve and debit balance
    const [updated] = await Promise.all([
      tx.leaveTransaction.update({
        where: { id },
        data: {
          approvalStatus: "APPROVED",
          approvedByUserId: auth.userId,
          approvedAt: new Date(),
        },
      }),
      tx.leaveBalance.update({
        where: { id: txn.leaveBalanceId },
        data: { used: { increment: txn.amount } },
      }),
    ]);

    return updated;
  });

  if (result === "not_found") return notFound("LeaveTransaction");
  if (result === "wrong_type") return err("Only USAGE transactions can be approved", 422);
  if (result === "not_pending") return err("Transaction is not in PENDING status", 409);
  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "APPROVE",
    entity: "LeaveTransaction",
    entityId: id,
    ipAddress: getClientIp(req),
  });
  return ok(serializeLeaveTransaction(result), "Leave request approved");
}
