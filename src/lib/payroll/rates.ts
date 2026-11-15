/**
 * Unit 1.8: the one place salary rates are derived (R89 absorbed the three
 * salary-type switches that used to live in engine.ts, persist.ts and
 * deduction-cap.ts). Pure: no database, no clock.
 *
 * Rulings (docs/DECISIONS.md, unit 1.8):
 *   D-S1  salary type (how the contract states the rate) is separate from the
 *         pay cycle (how often money changes hands).
 *   D-S2  a full period pays the contracted amount exactly; DAILY has no full
 *         period (days present × rate).
 *   D-S3  unpaid leave deducts a daily equivalent.
 *   D-S4  the divisor is a per-employee field (261 five-day week, 313
 *         six-day week), the tenant's when the employee has none; the divisor
 *         used is snapshotted on the sheet.
 *   D-S5  a monthly rate on a semi-monthly cycle splits into fixed halves.
 *   D-S6  weekly: daily equivalent = weekly ÷ days per week, and days per week
 *         = round(divisor / 52) (3 Sep: better than a hardcoded 6).
 *   D-S7 / R88  incoherent salary type × cycle pairings are refused.
 *   REP-7 an impossible divisor is refused rather than divided by.
 */
import type { PayFrequency, SalaryType } from "@prisma/client";
import { split } from "@/lib/money";

/** Divisor defaults by days worked per week (D-S4). */
export const DIVISOR_BY_DAYS_PER_WEEK: Readonly<Record<number, number>> = { 5: 261, 6: 313 };

/** Smallest and largest divisor accepted: one working day a week to every day of a leap year. */
export const MIN_DIVISOR = 52;
export const MAX_DIVISOR = 366;

/** The default divisor for a work schedule with `workDays` days a week, or null when there is none. */
export function divisorForWorkDays(workDays: number): number | null {
  return DIVISOR_BY_DAYS_PER_WEEK[workDays] ?? null;
}

export class SalaryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalaryConfigError";
  }
}

/** The divisor used for an employee: their own, else the tenant's (D-S4). Refuses an impossible one (REP-7). */
export function effectiveDivisor(employeeDivisor: number | null | undefined, tenantDivisor: number): number {
  const d = employeeDivisor ?? tenantDivisor;
  if (!Number.isInteger(d) || d < MIN_DIVISOR || d > MAX_DIVISOR) {
    throw new SalaryConfigError(
      `Working-days divisor ${d} is not usable: it must be a whole number from ${MIN_DIVISOR} to ${MAX_DIVISOR} (261 for a five-day week, 313 for a six-day week).`,
    );
  }
  return d;
}

/** Days worked per week implied by a divisor: 261 → 5, 313 → 6, 365 → 7 (D-S6). */
export function daysPerWeek(divisor: number): number {
  return Math.round(divisor / 52);
}

// ── Pairings (D-S7, R88) ─────────────────────────────────────────────────────

const LABEL: Record<string, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BI_WEEKLY: "bi-weekly",
  SEMI_MONTHLY: "semi-monthly",
  MONTHLY: "monthly",
};

/**
 * Refused salary type × pay cycle pairings. R88 (3 Sep 2026): a full period
 * must be a whole number of contract units, so a monthly rate cannot be paid
 * weekly or daily, and a weekly rate cannot be paid semi-monthly or monthly.
 * BI_WEEKLY (not covered by R88; 15 Nov 2026, same principle): a monthly rate
 * cannot be paid bi-weekly; a weekly rate paid bi-weekly is two weeks.
 */
export const REFUSED_PAIRINGS: ReadonlyArray<readonly [SalaryType, PayFrequency]> = [
  ["MONTHLY", "WEEKLY"],
  ["MONTHLY", "DAILY"],
  ["MONTHLY", "BI_WEEKLY"],
  ["WEEKLY", "SEMI_MONTHLY"],
  ["WEEKLY", "MONTHLY"],
];

/** Null when the pairing is allowed; otherwise the reason, worded for HR. */
export function pairingRefusal(salaryType: SalaryType, payFrequency: PayFrequency): string | null {
  const refused = REFUSED_PAIRINGS.some(([s, f]) => s === salaryType && f === payFrequency);
  if (!refused) return null;
  return `A ${LABEL[salaryType]} salary cannot be paid on a ${LABEL[payFrequency]} pay cycle: a ${LABEL[payFrequency]} period is not a whole number of ${salaryType === "MONTHLY" ? "months" : "weeks"}. Change the salary type or the pay cycle.`;
}

// ── Rates ────────────────────────────────────────────────────────────────────

/** HALF-UP division of positive bigints (the project's one rounding rule). */
function divHalfUp(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

export interface SalaryRates {
  /** The divisor used (employee's, else tenant's). Snapshotted on the sheet. */
  divisor: number;
  daysPerWeek: number;
  /**
   * Daily rate for OT, NSD, holiday and undertime, and for attendance pay
   * (DAILY salaries, off-cycle runs, partial periods). Same arithmetic as
   * before 1.8 except that WEEKLY divides by days per week, not a fixed 5.
   */
  dailyRateCents: bigint;
  hourlyRateCents: bigint;
  /** Basis for SSS / PhilHealth / Pag-IBIG. Not changed by 1.8. */
  monthlyEquivalentCents: bigint;
  /** What one unpaid day deducts from a contracted period (D-S3), HALF-UP. */
  lwopDailyEquivalentCents: bigint;
}

export function deriveSalaryRates(args: {
  basicSalaryCents: bigint;
  salaryType: SalaryType;
  divisor: number;
  hoursPerDay: number;
}): SalaryRates {
  const { basicSalaryCents: basic, salaryType, divisor, hoursPerDay } = args;
  const dpw = daysPerWeek(divisor);
  let dailyRateCents: bigint;
  let monthlyEquivalentCents: bigint;
  let lwopDailyEquivalentCents: bigint;

  switch (salaryType) {
    case "MONTHLY":
      dailyRateCents = (basic * 12n) / BigInt(divisor);
      monthlyEquivalentCents = basic;
      lwopDailyEquivalentCents = divHalfUp(basic * 12n, BigInt(divisor));
      break;
    case "DAILY":
      dailyRateCents = basic;
      monthlyEquivalentCents = (basic * BigInt(divisor)) / 12n;
      lwopDailyEquivalentCents = basic;
      break;
    case "WEEKLY":
      dailyRateCents = basic / BigInt(dpw);
      monthlyEquivalentCents = (basic * 52n) / 12n;
      lwopDailyEquivalentCents = divHalfUp(basic, BigInt(dpw));
      break;
    default: {
      const _exhaustive: never = salaryType;
      throw new Error(`Unsupported salaryType: ${String(_exhaustive)}`);
    }
  }

  const hourlyRateCents = BigInt(Math.round(Number(dailyRateCents) / (hoursPerDay || 8)));
  return { divisor, daysPerWeek: dpw, dailyRateCents, hourlyRateCents, monthlyEquivalentCents, lwopDailyEquivalentCents };
}

/**
 * The contracted amount for one period of `cycle` (D-S2, D-S5), or null when
 * pay is by attendance (DAILY salaries; a weekly rate paid daily). Throws
 * SalaryConfigError for a refused pairing (R88).
 *
 * Semi-monthly halves follow the statutory cutoff rule's reading of a period:
 * a period ending on or before the 15th is the first half, which takes any
 * odd centavo (money.split).
 */
export function contractedPeriodCents(args: {
  basicSalaryCents: bigint;
  salaryType: SalaryType;
  cycle: PayFrequency;
  periodEnd: Date;
}): bigint | null {
  const { basicSalaryCents: basic, salaryType, cycle, periodEnd } = args;
  const refusal = pairingRefusal(salaryType, cycle);
  if (refusal) throw new SalaryConfigError(refusal);

  if (salaryType === "DAILY") return null;
  if (salaryType === "MONTHLY") {
    if (cycle === "MONTHLY") return basic;
    if (cycle === "SEMI_MONTHLY") {
      const [first, second] = split(basic, 2);
      return periodEnd.getUTCDate() <= 15 ? first! : second!;
    }
  }
  if (salaryType === "WEEKLY") {
    if (cycle === "WEEKLY") return basic;
    if (cycle === "BI_WEEKLY") return basic * 2n;
    if (cycle === "DAILY") return null;
  }
  // Unreachable while REFUSED_PAIRINGS covers every other combination.
  throw new SalaryConfigError(`No contracted amount for a ${salaryType} salary on a ${cycle} cycle.`);
}

/** True when the employee was employed for the whole period (G2, 15 Nov 2026). Compares calendar days. */
export function employedWholePeriod(args: {
  hireDate?: Date | null;
  separationDate?: Date | null;
  periodStart: Date;
  periodEnd: Date;
}): boolean {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (args.hireDate && day(args.hireDate) > day(args.periodStart)) return false;
  if (args.separationDate && day(args.separationDate) < day(args.periodEnd)) return false;
  return true;
}
