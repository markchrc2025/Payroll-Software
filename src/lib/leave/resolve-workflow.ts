/**
 * Resolves the effective LeaveWorkflow for an employee.
 *
 * Precedence (highest → lowest):
 *   1. Most-recent EmploymentTerm.leaveWorkflowKey that is set
 *   2. Tenant's DEFAULT workflow (code = "DEFAULT")
 *   3. null — no workflow configured (leave is approved immediately on filing)
 */

import type { TenantTx } from "@/lib/with-tenant";
import type { RoleKey } from "./resolve-approvers";

export type WorkflowSnapshot = {
  workflowId: string;
  code: string;
  approverKeys: RoleKey[];
};

export async function resolveEffectiveWorkflow(
  employeeId: string,
  tenantId: string,
  tx: TenantTx,
): Promise<WorkflowSnapshot | null> {
  // Step 1: EmploymentTerm key (most recent that has one).
  const latestTerm = await tx.employmentTerm.findFirst({
    where: { employeeId, tenantId, leaveWorkflowKey: { not: null } },
    orderBy: { effectiveDate: "desc" },
    select: { leaveWorkflowKey: true },
  });

  if (latestTerm?.leaveWorkflowKey) {
    return lookupWorkflowByCode(latestTerm.leaveWorkflowKey, tenantId, tx);
  }

  // Step 2: Level default workflow.
  const emp = await tx.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: {
      level: {
        select: { defaultLeaveWorkflowId: true },
      },
    },
  });

  if (emp?.level?.defaultLeaveWorkflowId) {
    const wf = await tx.leaveWorkflow.findFirst({
      where: {
        id: emp.level.defaultLeaveWorkflowId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, code: true, approvers: true },
    });
    if (wf) return toSnapshot(wf);
  }

  // Step 3: Tenant DEFAULT workflow.
  const workflowCode = "DEFAULT";

  return lookupWorkflowByCode(workflowCode, tenantId, tx);
}

async function lookupWorkflowByCode(
  code: string,
  tenantId: string,
  tx: TenantTx,
): Promise<WorkflowSnapshot | null> {
  const wf = await tx.leaveWorkflow.findFirst({
    where: { tenantId, code, deletedAt: null, isActive: true },
    select: { id: true, code: true, approvers: true },
  });
  return wf ? toSnapshot(wf) : null;
}

function toSnapshot(wf: {
  id: string;
  code: string;
  approvers: unknown;
}): WorkflowSnapshot {
  const approverKeys = (wf.approvers as string[]).filter(
    (k): k is RoleKey =>
      ["supervisor", "line_manager", "dept_head", "hr_manager", "ceo"].includes(k),
  );
  return { workflowId: wf.id, code: wf.code, approverKeys };
}
