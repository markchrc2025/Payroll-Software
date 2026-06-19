/**
 * /api/employees/[id]/dtr/aggregate
 *   POST -- Aggregate APPROVED DTR records for a period -> upsert PeriodInput
 *
 * Phase AE1: full 25-scenario stacking matrix + "day before" holiday
 * entitlement check (DOLE Art. 94 interpretation).
 *
 * Body: { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD", replace?: boolean }
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import type { HolidayCategory } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { aggregateDtrSchema } from "@/lib/validations/dtr";
import { isEntitledToHolidayPay } from "@/lib/payroll/holiday-entitlement";
import { getOrSet } from "@/lib/cache/cache";
import { CacheKeys, TTL } from "@/lib/cache/keys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = aggregateDtrSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { periodStart, periodEnd, replace } = parsed.data;

  if (periodEnd < periodStart)
    return err("periodEnd must be on or after periodStart", 422);

  const periodStartDate = new Date(periodStart + "T00:00:00.000Z");
  const periodEndDate   = new Date(periodEnd   + "T23:59:59.999Z");

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return "NOT_FOUND";

    const records = await tx.dTRRecord.findMany({
      where: {
        tenantId: auth.tenantId,
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
        tenantId: auth.tenantId,
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
    const holidays = await getOrSet(
      CacheKeys.holidays(auth.tenantId, yearMonth),
      TTL.HOLIDAYS,
      () =>
        tx.holiday.findMany({
          where: {
            tenantId: auth.tenantId,
            date: { gte: periodStartDate, lte: periodEndDate },
            deletedAt: null,
          },
          select: { date: true, category: true },
        }),
    );
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
        tenantId: auth.tenantId,
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

    for (const r of records) {
      const excused = excusedByDate.get(dateKey(new Date(r.date))) ?? 0;
      const deductibleUndertime = Math.max(0, r.undertimeMinutes - excused);
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
          auth.tenantId,
          tx,
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

    const data = {
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

      notes: `Aggregated from ${records.length} DTR records`,
    };

    const existing = await tx.periodInput.findFirst({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
      },
      select: { id: true },
    });

    if (existing && !replace) {
      return {
        skipped: true,
        message: "PeriodInput already exists. Pass replace:true to overwrite.",
        periodInputId: existing.id,
      };
    }

    if (existing) {
      return tx.periodInput.update({ where: { id: existing.id }, data });
    }

    return tx.periodInput.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
        ...data,
      },
    });
  });

  if (result === "NOT_FOUND") return notFound();
  return ok(result, "DTR aggregated into PeriodInput");
}
