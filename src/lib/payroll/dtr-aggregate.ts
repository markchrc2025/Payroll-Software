/**
 * Approved DTR for one employee and a date window, rolled up into the
 * payroll run inputs (days worked, unpaid days, lates, OT, NSD, rest-day and
 * holiday hours): the 25-scenario stacking matrix and the "day before"
 * holiday entitlement check (Phase AE1).
 *
 * Moved out of POST /api/employees/[id]/dtr/aggregate (PAY-142) so a payroll
 * run can read approved timekeeping for its cutoff window when it computes.
 * The route keeps its behaviour: it calls this and upserts PeriodInput.
 */
import { Prisma } from "@prisma/client";
import type { HolidayCategory } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { isEntitledToHolidayPay } from "@/lib/payroll/holiday-entitlement";
import { expandHolidays } from "@/lib/holidays/recurrence";
import { holidayAppliesToBranch } from "@/lib/holidays/scope";
import { getOrSet } from "@/lib/cache/cache";
import { CacheKeys, TTL } from "@/lib/cache/keys";
import { localDay } from "@/lib/time/zone";

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
const DOW_TO_WEEKDAY: Weekday[] = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

type HolidayBucket = "LEGAL" | "SPECIAL" | "DOUBLE";

function toHolidayBucket(categories: HolidayCategory[]): HolidayBucket | null {
  const hasLegal   = categories.includes("LEGAL");
  const hasSpecial = categories.some((c) =>
    c === "SPECIAL_NON_WORKING" || c === "SPECIAL_ONE_TIME" || c === "AREA_SPECIFIC",
  );
  if (hasLegal && hasSpecial) return "DOUBLE";
  if (hasLegal)   return "LEGAL";
  if (hasSpecial) return "SPECIAL";
  return null;
}

function strictRowsNote(args: { requireApproved?: boolean; noApprovedSubmission?: boolean }): string {
  return args.requireApproved || args.noApprovedSubmission ? "approved " : "";
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const minutesToHours = (m: number) =>
  new Prisma.Decimal(m).dividedBy(60).toDecimalPlaces(2).toString();

// ---------------------------------------------------------------------------
// Accumulator
// ---------------------------------------------------------------------------
interface Acc {
  daysWorked: number;
  lateUndertimeMinutes: number;
  unpaidLeaveDays: number;
  regularOtMinutes: number;
  nsdMinutes: number;
  nsdOtMinutes: number;
  hazardMinutes: number;
  dayOffDutyDays: number;
  restDayMinutes: number;
  restDayOtMinutes: number;
  nsdRestDayMinutes: number;
  nsdRestDayOtMinutes: number;
  specialHolidayMinutes: number;
  specialHolidayOtMinutes: number;
  nsdSpecialHolidayMinutes: number;
  nsdSpecialHolidayOtMinutes: number;
  restDaySpecialHolidayMinutes: number;
  restDaySpecialHolidayOtMinutes: number;
  nsdSpecialHolidayRestDayMinutes: number;
  nsdSpecialHolidayRestDayOtMinutes: number;
  regularHolidayMinutes: number;
  regularHolidayOtMinutes: number;
  nsdRegularHolidayMinutes: number;
  nsdRegularHolidayOtMinutes: number;
  noWorkRegularHolidayDays: number;
  restDayRegularHolidayMinutes: number;
  restDayRegularHolidayOtMinutes: number;
  nsdRegularHolidayRestDayMinutes: number;
  nsdRegularHolidayRestDayOtMinutes: number;
  doubleHolidayMinutes: number;
  doubleHolidayOtMinutes: number;
  nsdDoubleHolidayMinutes: number;
  nsdDoubleHolidayOtMinutes: number;
  restDayDoubleHolidayMinutes: number;
  restDayDoubleHolidayOtMinutes: number;
  nsdDoubleHolidayRestDayMinutes: number;
  nsdDoubleHolidayRestDayOtMinutes: number;
}

function emptyAcc(): Acc {
  return {
    daysWorked: 0, lateUndertimeMinutes: 0, unpaidLeaveDays: 0,
    regularOtMinutes: 0, nsdMinutes: 0, nsdOtMinutes: 0, hazardMinutes: 0,
    dayOffDutyDays: 0,
    restDayMinutes: 0, restDayOtMinutes: 0, nsdRestDayMinutes: 0, nsdRestDayOtMinutes: 0,
    specialHolidayMinutes: 0, specialHolidayOtMinutes: 0, nsdSpecialHolidayMinutes: 0, nsdSpecialHolidayOtMinutes: 0,
    restDaySpecialHolidayMinutes: 0, restDaySpecialHolidayOtMinutes: 0, nsdSpecialHolidayRestDayMinutes: 0, nsdSpecialHolidayRestDayOtMinutes: 0,
    regularHolidayMinutes: 0, regularHolidayOtMinutes: 0, nsdRegularHolidayMinutes: 0, nsdRegularHolidayOtMinutes: 0,
    noWorkRegularHolidayDays: 0,
    restDayRegularHolidayMinutes: 0, restDayRegularHolidayOtMinutes: 0, nsdRegularHolidayRestDayMinutes: 0, nsdRegularHolidayRestDayOtMinutes: 0,
    doubleHolidayMinutes: 0, doubleHolidayOtMinutes: 0, nsdDoubleHolidayMinutes: 0, nsdDoubleHolidayOtMinutes: 0,
    restDayDoubleHolidayMinutes: 0, restDayDoubleHolidayOtMinutes: 0, nsdDoubleHolidayRestDayMinutes: 0, nsdDoubleHolidayRestDayOtMinutes: 0,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------


/** The PeriodInput fields for an accumulator (decimals as strings). */
function toPeriodInputData(acc: Acc, notes: string) {
  return {
    daysWorked:           new Prisma.Decimal(acc.daysWorked).toString(),
    lateUndertimeMinutes: acc.lateUndertimeMinutes,
    regularOtHours:       minutesToHours(acc.regularOtMinutes),
    nightDiffHours:       minutesToHours(acc.nsdMinutes),
    nightDiffOtHours:     minutesToHours(acc.nsdOtMinutes),
    hazardHours:          minutesToHours(acc.hazardMinutes),
    unpaidLeaveDays:      new Prisma.Decimal(acc.unpaidLeaveDays).toString(),
    dayOffDutyDays:       new Prisma.Decimal(acc.dayOffDutyDays).toString(),

    restDayHours:            minutesToHours(acc.restDayMinutes),
    restDayOtHours:          minutesToHours(acc.restDayOtMinutes),
    nightDiffRestDayHours:   minutesToHours(acc.nsdRestDayMinutes),
    nightDiffRestDayOtHours: minutesToHours(acc.nsdRestDayOtMinutes),

    specialHolidayHours:            minutesToHours(acc.specialHolidayMinutes),
    specialHolidayOtHours:          minutesToHours(acc.specialHolidayOtMinutes),
    nightDiffSpecialHolidayHours:   minutesToHours(acc.nsdSpecialHolidayMinutes),
    nightDiffSpecialHolidayOtHours: minutesToHours(acc.nsdSpecialHolidayOtMinutes),

    restDaySpecialHolidayHours:            minutesToHours(acc.restDaySpecialHolidayMinutes),
    restDaySpecialHolidayOtHours:          minutesToHours(acc.restDaySpecialHolidayOtMinutes),
    nightDiffSpecialHolidayRestDayHours:   minutesToHours(acc.nsdSpecialHolidayRestDayMinutes),
    nightDiffSpecialHolidayRestDayOtHours: minutesToHours(acc.nsdSpecialHolidayRestDayOtMinutes),

    regularHolidayHours:            minutesToHours(acc.regularHolidayMinutes),
    regularHolidayOtHours:          minutesToHours(acc.regularHolidayOtMinutes),
    nightDiffRegularHolidayHours:   minutesToHours(acc.nsdRegularHolidayMinutes),
    nightDiffRegularHolidayOtHours: minutesToHours(acc.nsdRegularHolidayOtMinutes),
    noWorkRegularHolidayDays: new Prisma.Decimal(acc.noWorkRegularHolidayDays).toString(),

    restDayRegularHolidayHours:            minutesToHours(acc.restDayRegularHolidayMinutes),
    restDayRegularHolidayOtHours:          minutesToHours(acc.restDayRegularHolidayOtMinutes),
    nightDiffRegularHolidayRestDayHours:   minutesToHours(acc.nsdRegularHolidayRestDayMinutes),
    nightDiffRegularHolidayRestDayOtHours: minutesToHours(acc.nsdRegularHolidayRestDayOtMinutes),

    doubleHolidayHours:            minutesToHours(acc.doubleHolidayMinutes),
    doubleHolidayOtHours:          minutesToHours(acc.doubleHolidayOtMinutes),
    nightDiffDoubleHolidayHours:   minutesToHours(acc.nsdDoubleHolidayMinutes),
    nightDiffDoubleHolidayOtHours: minutesToHours(acc.nsdDoubleHolidayOtMinutes),

    restDayDoubleHolidayHours:            minutesToHours(acc.restDayDoubleHolidayMinutes),
    restDayDoubleHolidayOtHours:          minutesToHours(acc.restDayDoubleHolidayOtMinutes),
    nightDiffDoubleHolidayRestDayHours:   minutesToHours(acc.nsdDoubleHolidayRestDayMinutes),
    nightDiffDoubleHolidayRestDayOtHours: minutesToHours(acc.nsdDoubleHolidayRestDayOtMinutes),
    notes,
  };
}

export type DtrAggregateResult =
  | { status: "NOT_FOUND" }
  | { status: "NOT_APPROVED" }
  | {
      status: "OK";
      /** PeriodInput-shaped values (decimals as strings, minutes as numbers). */
      data: ReturnType<typeof toPeriodInputData>;
      /** Approved DTR records found in the window. */
      recordCount: number;
      attendanceExempt: boolean;
      /**
       * PAY-172: scheduled workdays counted absent because they had no
       * approved DTR (no row at all, or, with requireApproved, a row not yet
       * approved).
       */
      gapDays: number;
    };

/**
 * Rolls up approved DTR for [periodStartDate, periodEndDate] (dates at 00:00
 * and 23:59:59.999 UTC). When the company requires DTR submission, the window
 * must have a manager-approved submission, else NOT_APPROVED.
 */
export async function aggregateApprovedDtr(
  tx: TenantTx,
  args: {
    tenantId: string;
    employeeId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    now?: Date;
    /**
     * PAY-172 (Mark, 19 Nov 2026): a day whose DTR row is not approved
     * (pending or rejected) counts as absent, like a day with no row.
     */
    requireApproved?: boolean;
    /**
     * PAY-172: the company requires an approved DTR submission and the window
     * has none: skip that gate and count every scheduled workday as absent.
     */
    noApprovedSubmission?: boolean;
  },
): Promise<DtrAggregateResult> {
  const { tenantId, employeeId, periodStartDate, periodEndDate } = args;
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: tenantId },
      select: {
        id: true, attendanceExempt: true, branchId: true,
        hireDate: true, lastWorkingDate: true, resignationDate: true,
        tenant: { select: { timezone: true } },
      },
    });
    if (!employee) return { status: "NOT_FOUND" } as const;

    // Payroll gating: when the tenant requires employee DTR submission, the
    // period must have a manager-approved DTRSubmission before it can be paid.
    const dtrConfig = await tx.dTRApprovalConfig.findUnique({
      where: { tenantId: tenantId },
      select: { requiresEmployeeSubmission: true },
    });
    if (dtrConfig?.requiresEmployeeSubmission && !args.noApprovedSubmission) {
      const approved = await tx.dTRSubmission.findFirst({
        where: {
          tenantId: tenantId,
          employeeId,
          status: "MANAGER_APPROVED",
          periodStart: { lte: periodEndDate },
          periodEnd: { gte: periodStartDate },
        },
        select: { id: true },
      });
      if (!approved) return { status: "NOT_APPROVED" } as const;
    }

    const records = args.noApprovedSubmission
      ? []
      : await tx.dTRRecord.findMany({
          where: {
            tenantId: tenantId,
            employeeId,
            approvalStatus: "APPROVED",
            date: { gte: periodStartDate, lte: periodEndDate },
          },
        });

    // Approved undertime requests EXCUSE that day's undertime (it is not
    // deducted). Build a date -> excused-minutes map. Only unfiled/unapproved
    // undertime remains deductible.
    const approvedUndertime = await tx.undertimeRequest.findMany({
      where: {
        tenantId: tenantId,
        employeeId,
        status: "APPROVED",
        date: { gte: periodStartDate, lte: periodEndDate },
      },
      select: { date: true, undertimeMinutes: true },
    });
    const excusedByDate = new Map<string, number>();
    for (const u of approvedUndertime) {
      const k = dateKey(new Date(u.date));
      excusedByDate.set(k, (excusedByDate.get(k) ?? 0) + u.undertimeMinutes);
    }

    // Build holiday map: dateKey -> [HolidayCategory]
    const yearMonth = periodStartDate.toISOString().slice(0, 7); // YYYY-MM
    // Fetch non-recurring holidays in the period PLUS every recurring master;
    // recurring masters are expanded onto the period range below so an annual
    // holiday applies in every payroll year, not just the one it was created in.
    const holidayMasters = await getOrSet(
      CacheKeys.holidays(tenantId, yearMonth),
      TTL.HOLIDAYS,
      () =>
        tx.holiday.findMany({
          where: {
            tenantId: tenantId,
            deletedAt: null,
            OR: [
              { recurringAnnually: true },
              { date: { gte: periodStartDate, lte: periodEndDate } },
            ],
          },
          select: {
            date: true,
            category: true,
            recurringAnnually: true,
            skippedDates: true,
            scope: true,
            branchIds: true,
          },
        }),
    );
    // Expand recurring masters, then keep only holidays that apply to THIS
    // employee's branch (company-wide always applies; branch-specific only when
    // the employee's branch is listed).
    const holidays = expandHolidays(holidayMasters, periodStartDate, periodEndDate)
      .filter((h) => holidayAppliesToBranch(h, employee.branchId));
    const holidayMap = new Map<string, HolidayCategory[]>();
    for (const h of holidays) {
      const k = dateKey(h.date);
      const ex = holidayMap.get(k) ?? [];
      ex.push(h.category);
      holidayMap.set(k, ex);
    }

    // Shift schedule for rest-day detection
    const assignment = await tx.employeeShiftAssignment.findFirst({
      where: {
        tenantId: tenantId,
        employeeId,
        effectiveFrom: { lte: periodEndDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStartDate } }],
      },
      orderBy: { effectiveFrom: "desc" },
      include: {
        shiftSchedule: {
          select: { workDays: true, timeIn: true, timeOut: true, breakMinutes: true },
        },
      },
    });
    const workDays: Weekday[] = assignment?.shiftSchedule?.workDays
      ? (assignment.shiftSchedule.workDays as Weekday[])
      : ["MON", "TUE", "WED", "THU", "FRI"];

    const scheduledShiftMinutes = (() => {
      const ss = assignment?.shiftSchedule;
      if (!ss?.timeIn || !ss?.timeOut) return 480;
      const [inH, inM] = ss.timeIn.split(":").map(Number);
      const [outH, outM] = ss.timeOut.split(":").map(Number);
      const raw = (outH * 60 + outM) - (inH * 60 + inM);
      return (raw > 0 ? raw : raw + 1440) - (ss.breakMinutes ?? 60);
    })();

    const acc = emptyAcc();
    let absentNoRecordDays = 0;

    if (employee.attendanceExempt) {
      // Calendar-day scan: attendance-exempt employees (executives, C-level) are
      // assumed present on every scheduled workday without needing punch records.
      // Leave DTRRecords (written by finalizeLeaveApproval) and holidays still apply.
      const leaveByDate = new Map<string, typeof records[number]>();
      for (const r of records) {
        if (r.dayStatus === "PAID_LEAVE" || r.dayStatus === "UNPAID_LEAVE") {
          leaveByDate.set(dateKey(new Date(r.date)), r);
        }
      }

      const msPerDay = 86_400_000;
      for (
        let d = new Date(periodStartDate);
        d <= periodEndDate;
        d = new Date(d.getTime() + msPerDay)
      ) {
        const dKey    = dateKey(d);
        const weekday = DOW_TO_WEEKDAY[d.getUTCDay()];
        if (!workDays.includes(weekday)) continue; // rest day — skip

        const holCats   = holidayMap.get(dKey);
        const holBucket = holCats ? toHolidayBucket(holCats) : null;
        const leaveRec  = leaveByDate.get(dKey);

        if (leaveRec?.dayStatus === "UNPAID_LEAVE") {
          acc.unpaidLeaveDays++;
          continue;
        }

        if (holBucket === "LEGAL" || holBucket === "DOUBLE") {
          const entitled = await isEntitledToHolidayPay(employeeId, d, tenantId, tx, employee.branchId);
          if (!entitled) {
            acc.unpaidLeaveDays++;
            continue;
          }
          acc.daysWorked++;
          acc.noWorkRegularHolidayDays++;
          continue;
        }

        // Normal workday or special holiday or paid leave — count as worked.
        acc.daysWorked++;
      }
    } else {
    for (const r of records) {
      const excused = excusedByDate.get(dateKey(new Date(r.date))) ?? 0;
      // Approved undertime and paid-leave coverage both waive the deduction.
      const deductibleUndertime = Math.max(0, r.undertimeMinutes - excused - r.paidLeaveMinutes);
      acc.lateUndertimeMinutes += r.lateMinutes + deductibleUndertime;
      acc.hazardMinutes        += r.hazardMinutes;

      if (r.dayStatus === "ABSENT" || r.dayStatus === "UNPAID_LEAVE") {
        acc.unpaidLeaveDays++;
        continue;
      }

      const weekday   = DOW_TO_WEEKDAY[new Date(r.date).getUTCDay()];
      const isRestDay = !workDays.includes(weekday);
      const holCats   = holidayMap.get(dateKey(new Date(r.date)));
      const holBucket = holCats ? toHolidayBucket(holCats) : null;

      if (r.dayStatus === "HOLIDAY" && holBucket) {
        const entitled = await isEntitledToHolidayPay(
          employeeId,
          new Date(r.date),
          tenantId,
          tx,
          employee.branchId,
        );

        if (!entitled) {
          acc.unpaidLeaveDays++;
          continue;
        }

        acc.daysWorked++;

        if (r.workedMinutes === 0) {
          if (holBucket === "LEGAL" || holBucket === "DOUBLE") {
            acc.noWorkRegularHolidayDays++;
          }
          continue;
        }

        const w = r.workedMinutes, ot = r.otMinutes, nsd = r.nsdMinutes;

        if (holBucket === "SPECIAL") {
          if (isRestDay) {
            acc.restDaySpecialHolidayMinutes    += w;
            acc.restDaySpecialHolidayOtMinutes  += ot;
            acc.nsdSpecialHolidayRestDayMinutes += nsd;
          } else {
            acc.specialHolidayMinutes    += w;
            acc.specialHolidayOtMinutes  += ot;
            acc.nsdSpecialHolidayMinutes += nsd;
          }
        } else if (holBucket === "LEGAL") {
          if (isRestDay) {
            acc.restDayRegularHolidayMinutes    += w;
            acc.restDayRegularHolidayOtMinutes  += ot;
            acc.nsdRegularHolidayRestDayMinutes += nsd;
          } else {
            acc.regularHolidayMinutes    += w;
            acc.regularHolidayOtMinutes  += ot;
            acc.nsdRegularHolidayMinutes += nsd;
          }
        } else if (holBucket === "DOUBLE") {
          if (isRestDay) {
            acc.restDayDoubleHolidayMinutes    += w;
            acc.restDayDoubleHolidayOtMinutes  += ot;
            acc.nsdDoubleHolidayRestDayMinutes += nsd;
          } else {
            acc.doubleHolidayMinutes    += w;
            acc.doubleHolidayOtMinutes  += ot;
            acc.nsdDoubleHolidayMinutes += nsd;
          }
        }
        continue;
      }

      if (r.dayStatus === "REST_DAY") {
        acc.daysWorked++;
        if (r.workedMinutes >= scheduledShiftMinutes) {
          acc.dayOffDutyDays++;
        } else {
          acc.restDayMinutes    += r.workedMinutes;
          acc.restDayOtMinutes  += r.otMinutes;
          acc.nsdRestDayMinutes += r.nsdMinutes;
        }
        continue;
      }

      if (r.dayStatus === "PRESENT" || r.dayStatus === "PAID_LEAVE") {
        acc.daysWorked++;
        acc.regularOtMinutes += r.otMinutes;
        acc.nsdMinutes       += r.nsdMinutes;
        continue;
      }
    }

    // PAY-173: a scheduled workday with no DTR at all (no punches, no leave,
    // nothing filed) is an absence. It used to be skipped, so a monthly-paid
    // employee was paid for it. Only plain workdays count: rest days and
    // holidays keep their own rules, days before hire or after the last
    // working day are handled by proration, and days still to come are not
    // absences yet. A day with any DTR row (even unapproved) is not counted.
    const anyDays = await tx.dTRRecord.findMany({
      where: { tenantId, employeeId, date: { gte: periodStartDate, lte: periodEndDate } },
      select: { date: true },
    });
    // PAY-172: with requireApproved (or no approved submission) only an
    // approved row keeps a day from counting as absent.
    const approvedDays = new Set(records.map((r) => dateKey(new Date(r.date))));
    const strictRows = args.requireApproved || args.noApprovedSubmission;
    const hasRow = strictRows ? approvedDays : new Set(anyDays.map((r) => dateKey(new Date(r.date))));
    const today = dateKey(localDay(args.now ?? new Date(), employee.tenant?.timezone ?? "Asia/Manila"));
    const firstDay = dateKey(employee.hireDate);
    const separation = employee.lastWorkingDate ?? employee.resignationDate ?? null;
    const lastDay = separation ? dateKey(separation) : null;
    for (
      let d = new Date(Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth(), periodStartDate.getUTCDate()));
      d <= periodEndDate;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const k = dateKey(d);
      if (k >= today || k < firstDay || (lastDay !== null && k > lastDay)) continue;
      if (!workDays.includes(DOW_TO_WEEKDAY[d.getUTCDay()])) continue;
      if (holidayMap.has(k) || hasRow.has(k)) continue;
      acc.unpaidLeaveDays++;
      absentNoRecordDays++;
    }
    } // end non-exempt branch

    const data = toPeriodInputData(
      acc,
      employee.attendanceExempt
      ? `Attendance-exempt: calendar-day scan, ${records.length} leave record(s) applied`
      : `Aggregated from ${records.length} DTR records` +
        (absentNoRecordDays > 0
          ? `; ${absentNoRecordDays} scheduled workday(s) with no ${strictRowsNote(args)}DTR counted as absent`
          : ""),
    );
  return { status: "OK", data, recordCount: records.length, attendanceExempt: employee.attendanceExempt, gapDays: absentNoRecordDays };
}
