/**
 * /api/leave-transactions/[id]/reject
 *   POST — reject a PENDING leave transaction (or the current workflow step).
 *
 * Requires rejectionReason in body. No balance mutation.
 * The assigned approver for the current step OR an HR admin can reject.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { rejectLeaveSchema } from "@/lib/validations/leave";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { checkPermission } from "@/lib/require-permission";

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
      include: {
        leaveApprovals: { orderBy: { stepIndex: "asc" } },
      },
    });
    if (!txn) return "not_found" as const;
    if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

    const steps = txn.leaveApprovals;

    if (steps.length > 0) {
      const currentStep =
        steps.find(
          (s) => s.stepIndex === txn.currentStepIndex && s.status === "PENDING",
        ) ?? steps.find((s) => s.status === "PENDING");

      if (!currentStep) return "not_pending" as const;

      const callerEmployee = await tx.employee.findFirst({
        where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });

      const isAssignedApprover = callerEmployee?.id === currentStep.approverEmployeeId;
      const isHrOverride =
        auth.systemRole === "SUPER_ADMIN" ||
        (auth.roleId
          ? await checkPermission(auth.tenantId, auth.roleId, "LEAVES", "APPROVE")
          : false);

      if (!isAssignedApprover && !isHrOverride) {
        return "forbidden" as const;
      }

      await tx.leaveApproval.update({
        where: { id: currentStep.id },
        data: {
          status: "REJECTED",
          actedByUserId: auth.userId,
          actedAt: new Date(),
          note: rejectionReason,
        },
      });
    }

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
  if (result === "forbidden")
    return err("You are not the assigned approver for this step", 403);
  return ok(serializeLeaveTransaction(result), "Leave request rejected");
}
