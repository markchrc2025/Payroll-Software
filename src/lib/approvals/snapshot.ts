/**
 * Snapshots an approval chain for an entity at filing/submission time.
 *
 * Resolves the effective workflow for the requester + module, resolves the
 * role-key chain to concrete approvers, and writes one ApprovalStep row per
 * resolvable step (null/self-approval slots are omitted). Returns the number of
 * active steps and the index of the first active step.
 *
 * If there are no active steps the entity should be treated as auto-approved.
 */
import type { ApprovalModule } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { resolveEffectiveWorkflow } from "./resolve-workflow";
import { resolveChain } from "./resolve-chain";

export type SnapshotResult = {
  activeSteps: number;
  firstStepIndex: number;
};

export async function snapshotApprovalChain(
  tx: TenantTx,
  opts: {
    module: ApprovalModule;
    entityId: string;
    requesterId: string;
    tenantId: string;
  },
): Promise<SnapshotResult> {
  const { module, entityId, requesterId, tenantId } = opts;

  const workflow = await resolveEffectiveWorkflow(requesterId, tenantId, module, tx);
  const slots = workflow
    ? await resolveChain(requesterId, tenantId, workflow.approverKeys, tx)
    : [];

  const rows = slots.flatMap((slot, index) =>
    slot === null
      ? []
      : [
          {
            id: crypto.randomUUID().replace(/-/g, ""),
            tenantId,
            module,
            entityId,
            stepIndex: index,
            roleKey: slot.roleKey,
            approverEmployeeId: slot.approverEmployeeId,
            status: "PENDING" as const,
            updatedAt: new Date(),
          },
        ],
  );

  if (rows.length === 0) return { activeSteps: 0, firstStepIndex: 0 };

  await tx.approvalStep.createMany({ data: rows });
  return { activeSteps: rows.length, firstStepIndex: rows[0].stepIndex };
}
