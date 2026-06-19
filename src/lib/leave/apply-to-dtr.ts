/**
 * src/lib/leave/apply-to-dtr.ts
 *
 * Bridges approved leave into the DTR so payroll recognizes it:
 *   - Paid leave  → DTRRecord marked PAID_LEAVE (full day) or PRESENT with
 *     paidLeaveMinutes (partial), which counts as a paid day and suppresses the
 *     undertime deduction for the covered portion.
 *   - Unpaid (LWOP) → DTRRecord marked UNPAID_LEAVE so it is excluded from
 *     paid days in payroll aggregation.
 *
 * `finalizeLeaveApproval` is called from every place a USAGE leave reaches its
 * final APPROVED state. It debits the balance by the *paid* units only and
 * writes the DTR. `reverseLeaveDtr` undoes the DTR write (e.g. on rejection of
 * a previously-approved leave).
 *
 * Scope (v1): one scheduled-day length is resolved per employee (from the shift
 * active on the leave's start date, else standardWorkHours), and applied to
 * every covered workday. HALF/HOURS leaves are single-day (enforced at filing).
 */
import type { TenantTx } from "@/lib/with-tenant";

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
const DOW_TO_WEEKDAY: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const SHIFT_SELECT = {
  timeIn: true,
  timeOut: true,
  breakMinutes: true,
  workDays: true,
  crossesMidnight: true,
} as const;

/** Inclusive list of UTC-midnight dates between start and end. */
function enumerateDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(start);
  d.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (d <= last) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Scheduled minutes for a shift's working day (span − break), fallback aware. */
function shiftScheduledMinutes(
  shift: { timeIn: string | null; timeOut: string | null; breakMinutes: number; crossesMidnight: boolean } | null,
  fallbackMinutes: number,
): number {
  if (!shift?.timeIn || !shift?.timeOut) return fallbackMinutes;
  const [inH, inM] = shift.timeIn.split(":").map(Number);
  const [outH, outM] = shift.timeOut.split(":").map(Number);
  let raw = (outH * 60 + outM) - (inH * 60 + inM);
  if (shift.crossesMidnight || raw <= 0) raw += 1440;
  return Math.max(0, raw - (shift.breakMinutes ?? 60));
}

interface ResolvedSchedule {
  scheduledMinutes: number;
  workDays: Weekday[];
}

/** Resolve the employee's scheduled day length + working days for a date. */
async function resolveSchedule(
  tx: TenantTx,
  tenantId: string,
  employeeId: string,
  onDate: Date,
): Promise<ResolvedSchedule> {
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { standardWorkHours: true, shiftScheduleId: true },
  });
  const fallbackMinutes = Math.round(Number(employee?.standardWorkHours ?? 8) * 60) || 480;

  const assignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      tenantId,
      employeeId,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { shiftSchedule: { select: SHIFT_SELECT } },
  });

  let shift = assignment?.shiftSchedule ?? null;
  if (!shift && employee?.shiftScheduleId) {
    shift = await tx.shiftSchedule.findFirst({
      where: { id: employee.shiftScheduleId, deletedAt: null },
      select: SHIFT_SELECT,
    });
  }

  const workDays: Weekday[] = Array.isArray(shift?.workDays)
    ? (shift!.workDays as Weekday[])
    : ["MON", "TUE", "WED", "THU", "FRI"];

  return { scheduledMinutes: shiftScheduledMinutes(shift, fallbackMinutes), workDays };
}

/**
 * Write DTR rows for an approved leave. Idempotent per (employee, date) — re-runs
 * overwrite the same days. Skips days whose DTR is locked by payroll finalize.
 */
export async function applyLeaveToDtr(tx: TenantTx, leaveTransactionId: string): Promise<void> {
  const txn = await tx.leaveTransaction.findUnique({
    where: { id: leaveTransactionId },
    include: { leaveType: { select: { unit: true, isPaid: true } } },
  });
  if (!txn || txn.type !== "USAGE" || !txn.startDate || !txn.endDate) return;

  const { scheduledMinutes, workDays } = await resolveSchedule(
    tx, txn.tenantId, txn.employeeId, txn.startDate,
  );

  const isHours = txn.leaveType.unit === "HOURS";
  const portionFactor = txn.dayPortion === "FULL" ? 1 : 0.5;

  // Running budgets, expressed in the leave's unit (days for DAYS, hours for HOURS).
  let paidRemaining = Number(txn.paidUnits);

  const dates = enumerateDates(txn.startDate, txn.endDate);
  for (const d of dates) {
    const weekday = DOW_TO_WEEKDAY[d.getUTCDay()];
    if (!workDays.includes(weekday)) continue; // leave is counted on workdays only

    // Units consumed this day and the leave minutes it represents.
    const dayUnits = isHours ? Number(txn.amount) : portionFactor;
    const dayLeaveMinutes = isHours
      ? Math.min(scheduledMinutes, Math.round(Number(txn.amount) * 60))
      : Math.round(scheduledMinutes * portionFactor);

    const paidThisDay = Math.min(paidRemaining, dayUnits);
    paidRemaining = Math.max(0, paidRemaining - paidThisDay);
    const isPaidDay = txn.leaveType.isPaid && paidThisDay >= dayUnits - 1e-9;

    const existing = await tx.dTRRecord.findUnique({
      where: { tenantId_employeeId_date: { tenantId: txn.tenantId, employeeId: txn.employeeId, date: d } },
      select: { id: true, isLocked: true, workedMinutes: true },
    });
    if (existing?.isLocked) continue;

    const worked = existing?.workedMinutes ?? 0;
    const paidLeaveMinutes = isPaidDay ? dayLeaveMinutes : 0;
    const dayStatus = isPaidDay
      ? (worked > 0 ? "PRESENT" : "PAID_LEAVE")
      : (worked > 0 ? "PRESENT" : "UNPAID_LEAVE");

    if (existing) {
      await tx.dTRRecord.update({
        where: { id: existing.id },
        data: { dayStatus, paidLeaveMinutes, leaveTransactionId: txn.id },
      });
    } else {
      await tx.dTRRecord.create({
        data: {
          tenantId: txn.tenantId,
          employeeId: txn.employeeId,
          date: d,
          dayStatus,
          paidLeaveMinutes,
          leaveTransactionId: txn.id,
          // Leave-created days are already approved (the leave was approved).
          approvalStatus: "APPROVED",
        },
      });
    }
  }
}

/**
 * Reverse the DTR rows previously written for a leave. Days that have no worked
 * time revert to ABSENT; days with worked time keep PRESENT but drop the credit.
 * Skips locked records.
 */
export async function reverseLeaveDtr(tx: TenantTx, leaveTransactionId: string): Promise<void> {
  const rows = await tx.dTRRecord.findMany({
    where: { leaveTransactionId },
    select: { id: true, isLocked: true, workedMinutes: true, dayStatus: true },
  });
  for (const r of rows) {
    if (r.isLocked) continue;
    const revertStatus =
      r.workedMinutes > 0 ? r.dayStatus
      : (r.dayStatus === "PAID_LEAVE" || r.dayStatus === "UNPAID_LEAVE") ? "ABSENT"
      : r.dayStatus;
    await tx.dTRRecord.update({
      where: { id: r.id },
      data: { paidLeaveMinutes: 0, leaveTransactionId: null, dayStatus: revertStatus },
    });
  }
}

/**
 * Apply the side effects of a leave reaching final APPROVED state: debit the
 * balance by the PAID units only (LWOP units do not consume balance), then
 * write the DTR. Call this exactly once per final approval.
 */
export async function finalizeLeaveApproval(tx: TenantTx, leaveTransactionId: string): Promise<void> {
  const txn = await tx.leaveTransaction.findUnique({
    where: { id: leaveTransactionId },
    select: { leaveBalanceId: true, paidUnits: true },
  });
  if (!txn) return;

  if (Number(txn.paidUnits) > 0) {
    await tx.leaveBalance.update({
      where: { id: txn.leaveBalanceId },
      data: { used: { increment: txn.paidUnits } },
    });
  }
  await applyLeaveToDtr(tx, leaveTransactionId);
}
