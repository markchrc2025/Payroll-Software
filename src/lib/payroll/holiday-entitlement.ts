/**
 * Phase AE1 — DOLE "day before" holiday entitlement rule.
 *
 * Art. 94(a), Labor Code (as interpreted by DOLE LA): an employee is entitled
 * to holiday pay (including no-work pay) only if they were PRESENT or on
 * PAID_LEAVE on the last regular working day BEFORE the holiday.
 *
 * "Last regular working day" means: step back from the holiday date one day at
 * a time, skip weekends for the employee's shift schedule, and skip any other
 * holiday. Continue up to 7 calendar days. If no qualifying day is found the
 * employee is considered entitled (edge case guard; mirrors existing practice
 * for new-hires without any prior DTR records).
 */
import type { TenantTx } from "@/lib/with-tenant";
import type { DTRDayStatus } from "@prisma/client";
import { expandHolidays } from "@/lib/holidays/recurrence";

const WEEKDAYS_ISO = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Weekday = (typeof WEEKDAYS_ISO)[number];
/** Map JS Date.getDay() (Sun=0) → ISO weekday code. */
const DOW_TO_WEEKDAY: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Returns `true` when the employee is entitled to holiday pay for the given
 * `holidayDate`.
 *
 * Entitled = the last applicable working day before the holiday had a DTR
 * record with dayStatus PRESENT or PAID_LEAVE, OR no DTR record was found at
 * all (new hire / no prior attendance data → entitled by default).
 */
export async function isEntitledToHolidayPay(
  employeeId: string,
  holidayDate: Date,
  tenantId: string,
  tx: TenantTx,
): Promise<boolean> {
  // 1. Resolve the employee's current shift schedule workDays (rest days = all other days).
  const assignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      tenantId,
      employeeId,
      effectiveFrom: { lte: holidayDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: holidayDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: { shiftSchedule: { select: { workDays: true } } },
  });

  // workDays is a JSON array like ["MON","TUE","WED","THU","FRI"]
  const workDays: Weekday[] = assignment?.shiftSchedule?.workDays
    ? (assignment.shiftSchedule.workDays as Weekday[])
    : ["MON", "TUE", "WED", "THU", "FRI"]; // default: Mon–Fri

  // 2. Collect holiday dates in the look-back window so we can skip them.
  const lookBackStart = new Date(holidayDate);
  lookBackStart.setDate(lookBackStart.getDate() - 7);

  const holidayMasters = await tx.holiday.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { recurringAnnually: true },
        { date: { gte: lookBackStart, lt: holidayDate } },
      ],
    },
    select: { date: true, recurringAnnually: true, skippedDates: true },
  });
  // Expand recurring holidays onto the look-back window so annual holidays are
  // also skipped when walking back to the last regular working day.
  const holidayDateSet = new Set(
    expandHolidays(holidayMasters, lookBackStart, holidayDate).map((h) =>
      toUtcMidnightKey(h.date),
    ),
  );

  // 3. Walk back up to 7 days to find the last qualifying working day.
  let candidate: Date | null = null;
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(holidayDate);
    d.setDate(d.getDate() - offset);

    const dow = DOW_TO_WEEKDAY[d.getDay()];
    if (!workDays.includes(dow)) continue; // rest day for this employee
    if (holidayDateSet.has(toUtcMidnightKey(d))) continue; // also a holiday

    candidate = d;
    break;
  }

  // If no candidate found (e.g. extended holiday stretch), default to entitled.
  if (!candidate) return true;

  // 4. Look up the DTR record for that day.
  const dtr = await tx.dTRRecord.findFirst({
    where: {
      tenantId,
      employeeId,
      date: candidate,
    },
    select: { dayStatus: true },
  });

  // No DTR record → employee may be new-hire or no attendance data → entitled.
  if (!dtr) return true;

  const entitledStatuses: DTRDayStatus[] = ["PRESENT", "PAID_LEAVE"];
  return entitledStatuses.includes(dtr.dayStatus);
}

/** Returns "YYYY-MM-DD" for the UTC date of a JS Date. */
function toUtcMidnightKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
