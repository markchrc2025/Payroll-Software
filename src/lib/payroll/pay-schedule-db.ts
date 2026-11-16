/**
 * PAY-141: loading and saving a company's pay schedules, and the holidays a
 * payday moves back from. The calendar rules live in pay-schedule.ts (pure).
 */
import type { PayFrequency } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { expandHolidays } from "@/lib/holidays/recurrence";
import {
  listPaydays,
  ymd,
  type PayDayOccurrence,
  type PayScheduleConfig,
  type ScheduledCycle,
} from "./pay-schedule";

export const SCHEDULED_CYCLES: ScheduledCycle[] = ["SEMI_MONTHLY", "MONTHLY"];
export type PaydayCycle = "SEMI_MONTHLY" | "MONTHLY" | "WEEKLY" | "DAILY";
export const PAYDAY_CYCLES: PaydayCycle[] = ["SEMI_MONTHLY", "MONTHLY", "WEEKLY", "DAILY"];

type Row = {
  cycle: PayFrequency;
  payDay1: number;
  cutoff1StartDay: number;
  cutoff1EndDay: number;
  payDay2: number | null;
  cutoff2StartDay: number | null;
  cutoff2EndDay: number | null;
};

export function rowToConfig(r: Row): PayScheduleConfig | null {
  if (r.cycle !== "SEMI_MONTHLY" && r.cycle !== "MONTHLY") return null;
  const slots = [{ payDay: r.payDay1, cutoffStartDay: r.cutoff1StartDay, cutoffEndDay: r.cutoff1EndDay }];
  if (r.cycle === "SEMI_MONTHLY" && r.payDay2 != null && r.cutoff2StartDay != null && r.cutoff2EndDay != null) {
    slots.push({ payDay: r.payDay2, cutoffStartDay: r.cutoff2StartDay, cutoffEndDay: r.cutoff2EndDay });
  }
  return { cycle: r.cycle, slots };
}

/** The saved schedule for a cycle, or null (the default applies). */
export async function loadPaySchedule(
  tx: TenantTx,
  tenantId: string,
  cycle: PayFrequency,
): Promise<PayScheduleConfig | null> {
  if (cycle !== "SEMI_MONTHLY" && cycle !== "MONTHLY") return null;
  const row = await tx.paySchedule.findUnique({ where: { tenantId_cycle: { tenantId, cycle } } });
  return row ? rowToConfig(row) : null;
}

/**
 * Company-wide non-working holidays in [from, to] as "YYYY-MM-DD": regular
 * holidays and special non-working days. Area- and branch-specific holidays
 * do not move the company's payday.
 */
export async function loadPaydayHolidays(
  tx: TenantTx,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Set<string>> {
  const rows = await tx.holiday.findMany({
    where: {
      tenantId,
      deletedAt: null,
      scope: "COMPANY_WIDE",
      category: { in: ["LEGAL", "SPECIAL_NON_WORKING", "SPECIAL_ONE_TIME"] },
      OR: [{ recurringAnnually: true }, { date: { gte: from, lte: to } }],
    },
    select: { date: true, recurringAnnually: true, skippedDates: true },
  });
  return new Set(expandHolidays(rows, from, to).map((h) => ymd(h.date)));
}

/** Paydays for a cycle between two dates, with the company's schedule and holidays. */
export async function paydaysFor(
  tx: TenantTx,
  tenantId: string,
  cycle: PaydayCycle,
  from: Date,
  to: Date,
): Promise<PayDayOccurrence[]> {
  const config = await loadPaySchedule(tx, tenantId, cycle);
  // A payday can move back up to a few days; load holidays a week either side.
  const holidays = await loadPaydayHolidays(
    tx,
    tenantId,
    new Date(from.getTime() - 7 * 86_400_000),
    new Date(to.getTime() + 7 * 86_400_000),
  );
  return listPaydays({ cycle, config, from, to, holidays });
}
