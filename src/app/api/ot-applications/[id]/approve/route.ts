/**
 * POST /api/ot-applications/[id]/approve
 *
 * PENDING → APPROVED.
 * Also sets otMinutes on the linked DTRRecord (if the record exists for that date).
 * Idempotent: re-approving an already-APPROVED application returns 200.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { enqueueOtApproved } from "@/lib/jobs/workers";
import { applyOtBreakRule } from "@/lib/attendance/ot-policy";

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

  const result = await withTenant(auth.tenantId, async (tx) => {
    const ota = await tx.oTApplication.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!ota) return { notFound: true as const };
    if (ota.status === "REJECTED" || ota.status === "CANCELLED")
      return { terminal: true as const, status: ota.status };

    const now = new Date();
    const updated = await tx.oTApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: auth.userId,
        approvedAt: ota.approvedAt ?? now,
      },
    });

    // Resolve the employee's effective shift for that date to apply the OT
    // break-deduction rule (e.g. 9h OT → 8h payable). Priority: effective-dated
    // assignment → Employee.shiftScheduleId fallback. No shift → no deduction.
    const otAssignment = await tx.employeeShiftAssignment.findFirst({
      where: {
        tenantId:      auth.tenantId,
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
        where: { id: ota.employeeId, tenantId: auth.tenantId },
        select: { shiftSchedule: { select: OT_POLICY_SELECT } },
      });
      otShift = emp?.shiftSchedule ?? null;
    }

    // Sync DTRRecord.otMinutes — upsert so REST DAY OT creates a record too
    const rawOtMinutes = Math.round(Number(ota.hours) * 60);
    const otMinutes = otShift
      ? applyOtBreakRule(rawOtMinutes, otShift)
      : rawOtMinutes;
    await tx.dTRRecord.upsert({
      where: {
        tenantId_employeeId_date: {
          tenantId: auth.tenantId,
          employeeId: ota.employeeId,
          date: ota.date,
        },
      },
      update: { otMinutes },
      create: {
        tenantId: auth.tenantId,
        employeeId: ota.employeeId,
        date: ota.date,
        dayStatus: "REST_DAY",
        otMinutes,
      },
    });

    return { notFound: false as const, terminal: false as const, row: updated };
  });

  if (result.notFound) return notFound("OT application not found");
  if (result.terminal)
    return err(`Cannot approve a ${result.status} application`, 409);

  // Enqueue notification (best-effort — don't block response)
  void enqueueOtApproved({
    tenantId: auth.tenantId,
    otApplicationId: id,
  }).catch((e) =>
    console.error("[api/ot-applications/approve] Failed to enqueue ot.approved:", e),
  );

  return ok(result.row, "OT application approved");
}
