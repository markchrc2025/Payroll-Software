/**
 * PAY-133: which month's basic pay the SSS contribution is computed on.
 *
 * Mark's rulings (15 and 16 Nov 2026):
 *   - SSS is on basic pay actually earned: basic after unpaid days and lates.
 *     Overtime, night differential, holiday pay, rest day pay and allowances
 *     are NOT part of the base.
 *   - When contributions are deducted on the FIRST payday of the month, the
 *     base is the PREVIOUS month's actual basic (the current month is not
 *     over yet).
 *   - An employee's first month: no SSS (no previous month to base it on).
 *     PhilHealth and Pag-IBIG are unchanged (contracted basic salary).
 *
 * Applied here:
 *   - SEMI_MONTHLY + FIRST_CUTOFF: previous calendar month, from finalized runs.
 *   - SEMI_MONTHLY + SECOND_CUTOFF, MONTHLY, WEEKLY, DAILY: the month being
 *     closed (the deduction run is its last run), from finalized runs earlier
 *     in that month plus this run's own basic.
 *   - If any employed day of the base month is not covered by a finalized run
 *     in Sentire (for example the company's first month on the system, or the
 *     previous month's second cutoff is not finalized yet), the base falls back
 *     to the contracted monthly basic, and the payslip says so.
 *
 * This module is pure: no database, no clock. persist.ts loads the sheets.
 */
import type { PayFrequency } from "@prisma/client";

export type SssBasisKind =
  /** Previous month's actual basic (FIRST_CUTOFF). */
  | "PREVIOUS_MONTH_ACTUAL"
  /** This month's actual basic, including this run (month-closing run). */
  | "THIS_MONTH_ACTUAL"
  /** Not hired yet in the base month: no SSS this run. */
  | "NEW_HIRE_NO_SSS"
  /** Base month not fully in Sentire: contracted monthly basic used. */
  | "CONTRACTED_FALLBACK";

export type SssBasis =
  | {
      kind: "PREVIOUS_MONTH_ACTUAL" | "THIS_MONTH_ACTUAL";
      /** YYYY-MM of the base month. */
      month: string;
      /** Basic (after unpaid days and lates) from finalized runs. */
      priorBasicCents: bigint;
      /** Add this run's own basic (base pay minus late) on top. */
      includeThisRun: boolean;
    }
  | { kind: "NEW_HIRE_NO_SSS"; month: string }
  | { kind: "CONTRACTED_FALLBACK"; month: string };

/** A finalized sheet of the same employee, as persist.ts loads it. */
export interface SssHistorySheet {
  periodStart: Date;
  periodEnd: Date;
  /** basePayCents minus lateUndertimeDeductionCents. */
  basicCents: bigint;
  /** REGULAR sheets prove coverage; OFF_CYCLE ones only add basic. */
  runType: "REGULAR" | "OFF_CYCLE";
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface SssBaseMonth {
  monthStart: Date;
  monthEnd: Date;
  /** YYYY-MM */
  month: string;
  includeThisRun: boolean;
}

/**
 * The base month for a run that DEDUCTS contributions. Call only when
 * `isStatutoryDeducted` is true for this run.
 */
export function sssBaseMonth(
  cycle: PayFrequency,
  rule: "FIRST_CUTOFF" | "SECOND_CUTOFF",
  periodStart: Date,
  periodEnd: Date,
): SssBaseMonth {
  const month = (y: number, m: number, includeThisRun: boolean): SssBaseMonth => {
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0));
    return { monthStart, monthEnd, month: monthKey(monthStart), includeThisRun };
  };
  const y = periodEnd.getUTCFullYear();
  const m = periodEnd.getUTCMonth();

  if (cycle === "SEMI_MONTHLY" && rule === "FIRST_CUTOFF") {
    return month(y, m - 1, false);
  }
  if (cycle === "WEEKLY" || cycle === "DAILY") {
    // Deducted on the run that contains a month's last day (month-end anchor):
    // the base month is that month.
    const lastOfStartMonth = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
    );
    if (utcDay(lastOfStartMonth) <= utcDay(periodEnd)) {
      return month(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), true);
    }
  }
  return month(y, m, true);
}

/**
 * Decides the SSS basis for one employee from their finalized sheets that
 * overlap the base month. `sheets` must not include the run being computed.
 */
export function assessSssBasis(args: {
  base: SssBaseMonth;
  thisPeriodStart: Date;
  thisPeriodEnd: Date;
  hireDate: Date | null;
  separationDate: Date | null;
  sheets: SssHistorySheet[];
}): SssBasis {
  const { base, sheets } = args;
  const mStart = utcDay(base.monthStart);
  const mEnd = utcDay(base.monthEnd);

  const hired = args.hireDate ? utcDay(args.hireDate) : null;
  if (hired !== null && hired > mEnd) {
    return { kind: "NEW_HIRE_NO_SSS", month: base.month };
  }

  // Employed days of the base month that must be covered by a run.
  const empFrom = Math.max(mStart, hired ?? mStart);
  const sep = args.separationDate ? utcDay(args.separationDate) : null;
  const empTo = Math.min(mEnd, sep ?? mEnd);

  // Runs counted for the base: those that start inside the base month and,
  // when this run is included, start before this run. A weekly period that
  // starts in the month and ends in the next belongs to the month it starts in.
  const thisStart = utcDay(args.thisPeriodStart);
  const counted = sheets.filter((s) => {
    const st = utcDay(s.periodStart);
    if (st < mStart || st > mEnd) return false;
    return base.includeThisRun ? st < thisStart : true;
  });

  // Coverage: every employed day is inside a finalized REGULAR run, or this run.
  const covered = new Set<number>();
  const cover = (from: number, to: number) => {
    for (let d = Math.max(from, empFrom); d <= Math.min(to, empTo); d++) covered.add(d);
  };
  for (const s of sheets) {
    if (s.runType === "REGULAR") cover(utcDay(s.periodStart), utcDay(s.periodEnd));
  }
  if (base.includeThisRun) cover(thisStart, utcDay(args.thisPeriodEnd));
  const needed = Math.max(0, empTo - empFrom + 1);
  if (covered.size < needed) {
    return { kind: "CONTRACTED_FALLBACK", month: base.month };
  }

  const priorBasicCents = counted.reduce(
    (sum, s) => sum + (s.basicCents > 0n ? s.basicCents : 0n),
    0n,
  );
  return {
    kind: base.includeThisRun ? "THIS_MONTH_ACTUAL" : "PREVIOUS_MONTH_ACTUAL",
    month: base.month,
    priorBasicCents,
    includeThisRun: base.includeThisRun,
  };
}

/**
 * The compensation the SSS table is looked up with, or null for no SSS.
 * `thisRunBasicCents` is this run's base pay minus late/undertime.
 */
export function sssCompensationCents(
  basis: SssBasis | undefined,
  thisRunBasicCents: bigint,
  contractedMonthlyCents: bigint,
): bigint | null {
  if (!basis || basis.kind === "CONTRACTED_FALLBACK") return contractedMonthlyCents;
  if (basis.kind === "NEW_HIRE_NO_SSS") return null;
  const own = basis.includeThisRun && thisRunBasicCents > 0n ? thisRunBasicCents : 0n;
  const total = basis.priorBasicCents + own;
  return total > 0n ? total : null;
}
