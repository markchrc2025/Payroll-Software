/**
 * GET /api/leave-approvals/pending
 *
 * Returns leave transactions that are pending approval by the calling user's
 * linked employee record. Used to build the "Pending my approval" inbox.
 *
 * Only returns transactions where the caller is the designated approver for
 * the current active step (currentStepIndex).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, unauthorized } from "@/lib/api-response";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const rows = await withTenant(auth.tenantId, async (tx) => {
    const callerEmployee = await tx.employee.findFirst({
      where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!callerEmployee) return [];

    // Find all pending LeaveApproval rows assigned to this employee.
    const pendingApprovals = await tx.leaveApproval.findMany({
      where: {
        tenantId: auth.tenantId,
        approverEmployeeId: callerEmployee.id,
        status: "PENDING",
      },
      select: { leaveTransactionId: true, stepIndex: true },
    });

    if (!pendingApprovals.length) return [];

    // Fetch the leave transactions where the current step matches.
    const txnIds = pendingApprovals.map((a) => a.leaveTransactionId);
    const stepMap = new Map(pendingApprovals.map((a) => [a.leaveTransactionId, a.stepIndex]));

    const transactions = await tx.leaveTransaction.findMany({
      where: {
        id: { in: txnIds },
        tenantId: auth.tenantId,
        approvalStatus: "PENDING",
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            department: { select: { name: true } },
          },
        },
        leaveType: { select: { id: true, name: true, code: true } },
        leaveApprovals: { orderBy: { stepIndex: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Filter: only include rows where caller's step is the current active step.
    return transactions.filter((t) => {
      const assignedStep = stepMap.get(t.id);
      return assignedStep !== undefined && t.currentStepIndex === assignedStep;
    });
  });

  return ok(
    rows.map((r) => ({
      ...serializeLeaveTransaction(r),
      employee: r.employee,
      leaveType: r.leaveType,
      leaveApprovals: r.leaveApprovals,
    })),
  );
}
