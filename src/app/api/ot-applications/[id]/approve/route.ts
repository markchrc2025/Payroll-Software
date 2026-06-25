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
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant, type TenantTx } from "@/lib/with-tenant";
import { requirePermission, checkPermission } from "@/lib/require-permission";
import { ok, err, notFound, forbidden } from "@/lib/api-response";
import { enqueueOtApproved } from "@/lib/jobs/workers";
import { applyOtBreakRule } from "@/lib/attendance/ot-policy";

const bodySchema = z.object({ note: z.string().optional() }).optional();

const OT_POLICY_SELECT = {
  otBreakMode:         true,
  otBreakTriggerHours: true,
  otBreakBlockHours:   true,
  otBreakMinutes:      true,
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  const { note } = bodySchema.parse(rawBody) ?? {};

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

  if ("notFound" in result && result.notFound) return notFound("OT application not found");
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeOtMinutes(
  tx: TenantTx,
  tenantId: string,
  ota: { employeeId: string; date: Date; hours: { toString(): string } },
) {
  const otAssignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      tenantId,
      employeeId:    ota.employeeId,
      effectiveFrom: { lte: ota.date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ota.date } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { shiftSchedule: { select: OT_POLICY_SELECT } },
  });
  let otShift = otAssignment?.shiftSchedule ?? null;
  if (!otShift) {
    const emp = await tx.employee.findFirst({
      where: { id: ota.employeeId, tenantId },
      select: { shiftSchedule: { select: OT_POLICY_SELECT } },
    });
    otShift = emp?.shiftSchedule ?? null;
  }

  const rawOtMinutes = Math.round(Number(ota.hours) * 60);
  const otMinutes = otShift ? applyOtBreakRule(rawOtMinutes, otShift) : rawOtMinutes;

  await tx.dTRRecord.upsert({
    where: { tenantId_employeeId_date: { tenantId, employeeId: ota.employeeId, date: ota.date } },
    update: { otMinutes },
    create: { tenantId, employeeId: ota.employeeId, date: ota.date, dayStatus: "REST_DAY", otMinutes },
  });
}
