/**
 * Leave-accrual arithmetic (unit 0.13).
 *
 * Leave converts to cash, so this is money arithmetic: one deterministic
 * rounding function, in one place, testable to the exact value.
 *
 * Representation note: leave days are Prisma `Decimal` (decimal.js), NOT floats,
 * and are stored as `Decimal(8,4)`. The pro-rate fraction (e.g. 15/28 =
 * 0.535714…) is NOT representable in 4 dp, so it is held at decimal.js working
 * precision and only the ROUNDED result is ever written. Rounding the fraction
 * first changes answers.
 */
import Decimal from "decimal.js";

/** Rounding step: quarter of a day (or quarter of an hour for HOURS types). */
export const QUARTER = new Decimal("0.25");

/**
 * Round a computed amount to the nearest quarter, ties UP (D-A).
 *
 * There is NO forfeiture floor — the earlier below-0.49→0 rule is withdrawn.
 * Instead a strictly-positive amount never rounds away to nothing: it earns at
 * least one quarter. Exactly zero stays zero.
 *
 *   0.3125 → 0.25    0.625 → 0.75 (tie, up)    0.6696 → 0.75
 *   1.25   → 1.25    1.30  → 1.25              1.875  → 2.00 (tie, up)
 *   0.10   → 0.25    (floor: positive never becomes zero)
 *   0      → 0
 */
export function roundToQuarter(value: Decimal.Value): Decimal {
  const d = new Decimal(value);
  if (d.lessThanOrEqualTo(0)) return new Decimal(0);

  // ROUND_HALF_CEIL rounds a .5 tie towards +Infinity, which is "ties up" for
  // the positive amounts this function is defined over.
  const rounded = d.dividedBy(QUARTER).toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).times(QUARTER);

  // A positive entitlement is never rounded away to nothing.
  return rounded.isZero() ? QUARTER : rounded;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type AccrualPeriodKind = "MONTHLY" | "QUARTERLY" | "ANNUALLY";

export interface AccrualPeriod {
  /** Inclusive first day, as a UTC-midnight Date representing a local calendar day. */
  start: Date;
  /** Inclusive last day. */
  end: Date;
  /** "2026-02" | "2026-Q1" | "2026". */
  key: string;
  /** Total days in the CALENDAR period — the pro-rate denominator (D8/D-E). */
  totalDays: number;
  /** The year the period ENDS in — which LeaveBalance row it belongs to (D-H). */
  year: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC-midnight Date for a calendar y/m/d. Dates here are calendar days, not instants. */
export function utcDay(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

/**
 * The calendar day it currently is in `timeZone` (D-G).
 *
 * Period boundaries follow the tenant's configured timezone, not the hardcoded
 * UTC+8 the handler used before. Returned as a UTC-midnight Date so every date
 * in this module is a calendar day rather than an instant. Falls back to UTC if
 * the tenant holds an unrecognised zone rather than throwing mid-job.
 */
export function todayInTimezone(now: Date, timeZone: string): Date {
  let parts: string;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
  const [y, m, d] = parts.split("-").map(Number);
  return utcDay(y, m, d);
}

/** Inclusive whole-day difference. */
export function inclusiveDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

/**
 * The calendar period CONTAINING the given day (D-E: natural calendar periods,
 * one code path for all three frequencies).
 */
export function periodContaining(kind: AccrualPeriodKind, day: Date): AccrualPeriod {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + 1;

  if (kind === "MONTHLY") {
    const start = utcDay(y, m, 1);
    const end = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last of this
    return { start, end, key: `${y}-${String(m).padStart(2, "0")}`, totalDays: inclusiveDays(start, end), year: y };
  }

  if (kind === "QUARTERLY") {
    const q = Math.floor((m - 1) / 3) + 1;
    const startMonth = (q - 1) * 3 + 1;
    const start = utcDay(y, startMonth, 1);
    const end = new Date(Date.UTC(y, startMonth + 2, 0));
    return { start, end, key: `${y}-Q${q}`, totalDays: inclusiveDays(start, end), year: y };
  }

  const start = utcDay(y, 1, 1);
  const end = utcDay(y, 12, 31);
  return { start, end, key: `${y}`, totalDays: inclusiveDays(start, end), year: y };
}

/** The most recently COMPLETED period as of `today` — accrual lands at period end (D5/D-E). */
export function lastCompletedPeriod(kind: AccrualPeriodKind, today: Date): AccrualPeriod {
  const current = periodContaining(kind, today);
  const dayBefore = new Date(current.start.getTime() - DAY_MS);
  return periodContaining(kind, dayBefore);
}

// ---------------------------------------------------------------------------
// The accrual decision
// ---------------------------------------------------------------------------

export interface AccrualInput {
  period: AccrualPeriod;
  /** Entitlement window (inclusive). `entitlementEnd` null = open-ended. */
  entitlementStart: Date;
  entitlementEnd: Date | null;
  /** Last day served (resignation / last working day), inclusive. Null = still serving. */
  servedUntil: Date | null;
  proRate: boolean;
  accrualAmount: Decimal.Value;
}

export interface AccrualResult {
  /** Days to grant. Zero means "grant nothing". */
  amount: Decimal;
  /** Days both entitled and served within the calendar period, inclusive. */
  coveredDays: number;
  /** True when the period was covered end to end. */
  fullPeriod: boolean;
}

/**
 * Decide what a single entitlement earns for a single period.
 *
 * D4  pro-rate OFF + mid-period START  → the FULL period amount.
 * D9  pro-rate OFF + mid-period EXIT   → NOTHING. Deliberately asymmetric with
 *     D4: generous at start, strict at exit.
 * D-D last served day == period end    → the period is earned IN FULL.
 * D6  pro-rate ON + partial coverage   → pro-rated by days, then rounded.
 * D-B/D7 a FULL period is never rounded — 1.25 stays 1.25.
 */
export function computeAccrual(input: AccrualInput): AccrualResult {
  const { period, entitlementStart, entitlementEnd, servedUntil, proRate } = input;
  const amount = new Decimal(input.accrualAmount);

  // Effective window: entitled AND served, clipped to the calendar period.
  const windowEnd = [period.end, entitlementEnd, servedUntil]
    .filter((d): d is Date => d instanceof Date)
    .reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
  const windowStart = entitlementStart.getTime() > period.start.getTime() ? entitlementStart : period.start;

  if (windowEnd.getTime() < windowStart.getTime()) {
    return { amount: new Decimal(0), coveredDays: 0, fullPeriod: false };
  }

  const coveredDays = inclusiveDays(windowStart, windowEnd);
  const coversPeriodEnd = windowEnd.getTime() >= period.end.getTime();
  const fullPeriod = coveredDays >= period.totalDays;

  if (fullPeriod) {
    // Never rounded (D-B / D7).
    return { amount, coveredDays, fullPeriod: true };
  }

  if (!proRate) {
    // D4 vs D9: a late START still earns the full period; an early EXIT earns
    // nothing. "Covers the period end" is what separates them, and D-D makes a
    // last working day ON the period end count as covering it.
    return coversPeriodEnd
      ? { amount, coveredDays, fullPeriod: false }
      : { amount: new Decimal(0), coveredDays, fullPeriod: false };
  }

  // Pro-rated: fraction held at working precision, only the result is rounded.
  const fraction = new Decimal(coveredDays).dividedBy(period.totalDays);
  return { amount: roundToQuarter(fraction.times(amount)), coveredDays, fullPeriod: false };
}
