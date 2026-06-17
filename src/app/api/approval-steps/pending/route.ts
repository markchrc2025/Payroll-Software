/**
 * GET /api/approval-steps/pending?module=LEAVE
 *
 * Returns approval requests (across modules) that are pending action by the
 * calling user's linked employee record. Used to build the "My Approvals" inbox.
 *
 * Only returns entities where the caller is the designated approver for the
 * current active step (entity.currentStepIndex === step.stepIndex).
 *
 * `module` query param filters to a single approval type (default: all). Each
 * module is enriched with its own entity shape (leave → leaveType + employee).
 */
import type { NextRequest } from "next/server";
import type { ApprovalModule } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, unauthorized } from "@/lib/api-response";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";

const VALID_MODULES: ApprovalModule[] = ["LEAVE", "DTR", "EXPENSE", "DOCUMENT"];

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const moduleParam = req.nextUrl.searchParams.get("module");
  const moduleFilter =
    moduleParam && VALID_MODULES.includes(moduleParam as ApprovalModule)
      ? (moduleParam as ApprovalModule)
      : undefined;

  const rows = await withTenant(auth.tenantId, async (tx) => {
    const callerEmployee = await tx.employee.findFirst({
      where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!callerEmployee) return [];

    // Find all pending ApprovalStep rows assigned to this employee.
    const pendingSteps = await tx.approvalStep.findMany({
      where: {
        tenantId: auth.tenantId,
        approverEmployeeId: callerEmployee.id,
        status: "PENDING",
        ...(moduleFilter && { module: moduleFilter }),
      },
      select: { module: true, entityId: true, stepIndex: true },
    });

    if (!pendingSteps.length) return [];

    // ----- LEAVE module enrichment -----
    const leaveSteps = pendingSteps.filter((s) => s.module === "LEAVE");
    if (!leaveSteps.length) return [];

    const leaveIds = leaveSteps.map((s) => s.entityId);
    const stepMap = new Map(leaveSteps.map((s) => [s.entityId, s.stepIndex]));

    const transactions = await tx.leaveTransaction.findMany({
      where: {
        id: { in: leaveIds },
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
        leaveType: { select: { id: true, name: true, code: true, unit: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Only include rows where caller's step is the current active step, then
    // attach the full step chain for progress display.
    const activeTxns = transactions.filter((t) => {
      const assignedStep = stepMap.get(t.id);
      return assignedStep !== undefined && t.currentStepIndex === assignedStep;
    });

    const allSteps = await tx.approvalStep.findMany({
      where: {
        tenantId: auth.tenantId,
        module: "LEAVE",
        entityId: { in: activeTxns.map((t) => t.id) },
      },
      orderBy: { stepIndex: "asc" },
    });
    const stepsByEntity = new Map<string, typeof allSteps>();
    for (const s of allSteps) {
      const arr = stepsByEntity.get(s.entityId) ?? [];
      arr.push(s);
      stepsByEntity.set(s.entityId, arr);
    }

    return activeTxns.map((t) => ({
      txn: t,
      steps: stepsByEntity.get(t.id) ?? [],
    }));
  });

  return ok(
    rows.map(({ txn, steps }) => ({
      ...serializeLeaveTransaction(txn),
      module: "LEAVE" as const,
      employee: txn.employee,
      leaveType: txn.leaveType,
      approvalSteps: steps,
    })),
  );
}
