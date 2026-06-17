/**
 * Resolves the effective ApprovalWorkflow for an employee + module.
 *
 * Precedence (highest → lowest):
 *   1. Current Placement's workflowId (most-recent placement record)
 *   2. Employee's JobLevel.defaultWorkflowId
 *   3. Tenant's DEFAULT workflow (code = "DEFAULT")
 *   4. null — no workflow configured (request is approved immediately on filing)
 *
 * The workflow's step array stores per-module toggles; only steps enabled for the
 * requested module contribute role keys to the resolved chain.
 */

import type { ApprovalModule } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { VALID_ROLE_KEYS, type RoleKey } from "./resolve-chain";

export type WorkflowStep = {
  roleKey: RoleKey;
  forLeave: boolean;
  forDtr: boolean;
  forExpense: boolean;
  forDocument: boolean;
};

export type WorkflowSnapshot = {
  workflowId: string;
  code: string;
  approverKeys: RoleKey[];
};

export async function resolveEffectiveWorkflow(
  employeeId: string,
  tenantId: string,
  module: ApprovalModule,
  tx: TenantTx,
): Promise<WorkflowSnapshot | null> {
  // Step 1: Current Placement's assigned workflow (most recent that has one).
  const latestPlacement = await tx.placement.findFirst({
    where: { employeeId, tenantId, workflowId: { not: null } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { workflowId: true },
  });

  if (latestPlacement?.workflowId) {
    const snap = await lookupWorkflowById(latestPlacement.workflowId, tenantId, module, tx);
    if (snap) return snap;
  }

  // Step 2: Level default workflow.
  const emp = await tx.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: {
      level: {
        select: { defaultWorkflowId: true },
      },
    },
  });

  if (emp?.level?.defaultWorkflowId) {
    const snap = await lookupWorkflowById(emp.level.defaultWorkflowId, tenantId, module, tx);
    if (snap) return snap;
  }

  // Step 3: Tenant DEFAULT workflow.
  return lookupWorkflowByCode("DEFAULT", tenantId, module, tx);
}

async function lookupWorkflowById(
  id: string,
  tenantId: string,
  module: ApprovalModule,
  tx: TenantTx,
): Promise<WorkflowSnapshot | null> {
  const wf = await tx.approvalWorkflow.findFirst({
    where: { id, tenantId, deletedAt: null, isActive: true },
    select: { id: true, code: true, approvers: true },
  });
  return wf ? toSnapshot(wf, module) : null;
}

async function lookupWorkflowByCode(
  code: string,
  tenantId: string,
  module: ApprovalModule,
  tx: TenantTx,
): Promise<WorkflowSnapshot | null> {
  const wf = await tx.approvalWorkflow.findFirst({
    where: { tenantId, code, deletedAt: null, isActive: true },
    select: { id: true, code: true, approvers: true },
  });
  return wf ? toSnapshot(wf, module) : null;
}

const MODULE_FLAG: Record<ApprovalModule, keyof WorkflowStep> = {
  LEAVE: "forLeave",
  DTR: "forDtr",
  EXPENSE: "forExpense",
  DOCUMENT: "forDocument",
};

function toSnapshot(
  wf: { id: string; code: string; approvers: unknown },
  module: ApprovalModule,
): WorkflowSnapshot {
  const flag = MODULE_FLAG[module];
  const steps = Array.isArray(wf.approvers) ? (wf.approvers as unknown[]) : [];

  const approverKeys = steps
    .filter((s): s is WorkflowStep => {
      if (typeof s !== "object" || s === null) return false;
      const step = s as Record<string, unknown>;
      return (
        typeof step.roleKey === "string" &&
        VALID_ROLE_KEYS.includes(step.roleKey as RoleKey) &&
        step[flag] === true
      );
    })
    .map((s) => s.roleKey);

  return { workflowId: wf.id, code: wf.code, approverKeys };
}
