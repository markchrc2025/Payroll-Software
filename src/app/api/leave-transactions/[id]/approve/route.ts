/**
 * /api/leave-transactions/[id]/approve
 *   POST — approve a PENDING leave transaction (or the current workflow step).
 *
 * Two modes:
 *   1. Workflow step: caller must be the approver for the current pending step,
 *      OR have HR role (override). Advances through steps; final approval debits
 *      balance.
 *   2. Legacy / no-workflow: HR can approve directly (same as before).
 *
 * Body (optional): { note?: string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { checkPermission } from "@/lib/require-permission";

const bodySchema = z.object({ note: z.string().optional() }).optional();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  const { note } = bodySchema.parse(rawBody) ?? {};

  const result = await withTenant(auth.tenantId, async (tx) => {
    const txn = await tx.leaveTransaction.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!txn) return "not_found" as const;
    if (txn.type !== "USAGE") return "wrong_type" as const;
    if (txn.approvalStatus === "APPROVED") return txn;
    if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

    const steps = await tx.approvalStep.findMany({
      where: { tenantId: auth.tenantId, module: "LEAVE", entityId: id },
      orderBy: { stepIndex: "asc" },
    });

    // ----- Workflow mode -----
    if (steps.length > 0) {
      // Find the current pending step.
      const currentStep = steps.find(
        (s) => s.stepIndex === txn.currentStepIndex && s.status === "PENDING",
      ) ?? steps.find((s) => s.status === "PENDING");

      if (!currentStep) {
        // All steps resolved — shouldn't normally reach here but guard anyway.
        return "not_pending" as const;
      }

      // Auth: caller must be the assigned approver OR have HR permission override.
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

      // Approve this step.
      await tx.approvalStep.update({
        where: { id: currentStep.id },
        data: {
          status: "APPROVED",
          actedByUserId: auth.userId,
          actedAt: new Date(),
          note: note ?? null,
        },
      });

      // Find next pending step.
      const nextStep = steps.find(
        (s) => s.stepIndex > currentStep.stepIndex && s.status === "PENDING",
      );

      if (nextStep) {
        // Advance pointer.
        await tx.leaveTransaction.update({
          where: { id },
          data: { currentStepIndex: nextStep.stepIndex },
        });
        return txn;
      }

      // All steps done — final approval.
      const [updated] = await Promise.all([
        tx.leaveTransaction.update({
          where: { id },
          data: {
            approvalStatus: "APPROVED",
            approvedByUserId: auth.userId,
            approvedAt: new Date(),
            currentStepIndex: currentStep.stepIndex,
          },
        }),
        tx.leaveBalance.update({
          where: { id: txn.leaveBalanceId },
          data: { used: { increment: txn.amount } },
        }),
      ]);
      return updated;
    }

    // ----- Legacy / no-workflow mode -----
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
  if (result === "forbidden")
    return err("You are not the assigned approver for this step", 403);

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
