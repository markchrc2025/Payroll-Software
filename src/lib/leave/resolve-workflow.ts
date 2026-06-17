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
  // Step 1: check most-recent EmploymentTerm with a leaveWorkflowKey
  const latestTerm = await tx.employmentTerm.findFirst({
    where: { employeeId, tenantId, leaveWorkflowKey: { not: null } },
    orderBy: { effectiveDate: "desc" },
    select: { leaveWorkflowKey: true },
  });

  const workflowCode = latestTerm?.leaveWorkflowKey ?? "DEFAULT";

  const workflow = await tx.leaveWorkflow.findFirst({
    where: { tenantId, code: workflowCode, deletedAt: null, isActive: true },
    select: { id: true, code: true, approvers: true },
  });

  if (!workflow) return null;

  const approverKeys = (workflow.approvers as string[]).filter(
    (k): k is RoleKey =>
      ["supervisor", "line_manager", "dept_head", "hr_manager", "ceo"].includes(k),
  );

  return { workflowId: workflow.id, code: workflow.code, approverKeys };
}
