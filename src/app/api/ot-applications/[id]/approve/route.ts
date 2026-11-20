/**
 * POST /api/ot-applications/[id]/approve
 *
 * Two modes:
 *   1. Workflow step: caller must be the approver for the current pending step,
 *      OR have TIMESHEETS:APPROVE override. Advances through steps; final step
 *      writes DTRRecord.otMinutes via applyOtBreakRule.
 *   2. Legacy / no-workflow: TIMESHEETS:APPROVE can approve directly.
 *
 * Idempotent: re-approving an already-APPROVED application returns 200.
 */
import { requireApprover } from "@/lib/approvals/second-party";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { checkPermission } from "@/lib/require-permission";
import { ok, err, notFound, forbidden } from "@/lib/api-response";
import { enqueueOtApproved } from "@/lib/jobs/workers";
import { writeOtMinutes } from "@/lib/attendance/ot-minutes";

const bodySchema = z.object({ note: z.string().optional() }).optional();


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Unit 0.22 Am 1 (B5): the owner or a role granted TIMESHEETS:APPROVE.
  const guard = await requireApprover(req, "OT");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  // The Approve button posts with no body; read that as "no note" (PAY-182).
  const { note } = bodySchema.parse(rawBody ?? undefined) ?? {};

  const result = await withTenant(auth.tenantId, async (tx) => {
    const ota = await tx.oTApplication.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!ota) return { notFound: true as const };
    if (ota.status === "APPROVED") return { row: ota };
    if (ota.status === "REJECTED" || ota.status === "CANCELLED")
      return { terminal: true as const, status: ota.status };

    const callerEmployee = await tx.employee.findFirst({
      where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (callerEmployee?.id && callerEmployee.id === ota.employeeId)
      return { self: true as const };

    const steps = await tx.approvalStep.findMany({
      where: { tenantId: auth.tenantId, module: "OT", entityId: id },
      orderBy: { stepIndex: "asc" },
    });

    // ----- Workflow step mode -----
    if (steps.length > 0) {
      const currentStep =
        steps.find((s) => s.stepIndex === ota.currentStepIndex && s.status === "PENDING") ??
        steps.find((s) => s.status === "PENDING");

      if (!currentStep) return { terminal: true as const, status: ota.status };

      const isAssignedApprover = callerEmployee?.id === currentStep.approverEmployeeId;
      const isOverride =
        auth.systemRole === "SUPER_ADMIN" ||
        (auth.roleId
          ? await checkPermission(auth.tenantId, auth.roleId, "TIMESHEETS", "APPROVE")
          : false);

      if (!isAssignedApprover && !isOverride) return { forbidden: true as const };

      await tx.approvalStep.update({
        where: { id: currentStep.id },
        data: { status: "APPROVED", actedByUserId: auth.userId, actedAt: new Date(), note: note ?? null },
      });

      const nextStep = steps.find(
        (s) => s.stepIndex > currentStep.stepIndex && s.status === "PENDING",
      );

      if (nextStep) {
        await tx.oTApplication.update({
          where: { id },
          data: { currentStepIndex: nextStep.stepIndex },
        });
        return { row: ota };
      }

      // Final step — approve and write otMinutes.
      const updated = await tx.oTApplication.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: auth.userId,
          approvedAt: new Date(),
          currentStepIndex: currentStep.stepIndex,
        },
      });
      await writeOtMinutes(tx, auth.tenantId, updated);
      return { row: updated };
    }

    // ----- Legacy / no-workflow mode -----
    const now = new Date();
    const updated = await tx.oTApplication.update({
      where: { id },
      data: { status: "APPROVED", approverId: auth.userId, approvedAt: ota.approvedAt ?? now },
    });
    await writeOtMinutes(tx, auth.tenantId, updated);
    return { row: updated };
  });

  if ("notFound" in result && result.notFound) return notFound("OT application");
  if ("self" in result && result.self)
    return forbidden("You cannot approve your own OT application");
  if ("terminal" in result && result.terminal)
    return err(`Cannot approve a ${result.status} application`, 409);
  if ("forbidden" in result && result.forbidden)
    return err("You are not the assigned approver for this step", 403);

  void enqueueOtApproved({ tenantId: auth.tenantId, otApplicationId: id }).catch((e) =>
    console.error("[api/ot-applications/approve] Failed to enqueue ot.approved:", e),
  );

  return ok(result.row, "OT application approved");
}
