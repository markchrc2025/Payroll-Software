/**
 * PAY-133: which month's basic pay the SSS contribution is computed on.
 *
 * Mark's rulings (15 and 16 Nov 2026):
 *   - SSS is on basic pay actually earned: basic after unpaid days and lates.
 *     Overtime, night differential, holiday pay, rest day pay and allowances
 *     are NOT part of the base.
 *   - SSS is ALWAYS based on the PREVIOUS month's basic. The company's
 *     deduction payday (first or second payday of the month) decides only
 *     WHEN it is deducted, never which month it is based on.
 *   - The deduction day is fixed: a new hire's SSS does not move to another
 *     payday. An employee's first month has no SSS (no previous month);
 *     PhilHealth and Pag-IBIG are unchanged (contracted basic salary).
 *
 * Applied here, for every cycle and rule: the base month is the calendar
 * month before the month the deduction run falls in (SEMI_MONTHLY and
 * MONTHLY: the month of the run's period end; WEEKLY and DAILY: the month
 * whose last day is in the run). Basic comes from finalized runs only.
 * If any employed day of the base month is not covered by a finalized run in
 * Sentire (for example the company's first month on the system, or the
 * previous month's last cutoff not finalized yet), the base falls back to the
 * contracted monthly basic, and the payslip says so.
 *
 * This module is pure: no database, no clock. persist.ts loads the sheets.
 */
import type { PayFrequency } from "@prisma/client";

export type SssBasisKind =
  /** Previous month's actual basic. */
  | "PREVIOUS_MONTH_ACTUAL"
  /** Not hired yet in the base month: no SSS this run. */
  | "NEW_HIRE_NO_SSS"
  /** Base month not fully in Sentire: contracted monthly basic used. */
  | "CONTRACTED_FALLBACK";

/**
 * PAY-143: other earnings of the base month that the company chose to add to
 * each contribution's base (pay components ticked for that base, and
 * attendance premiums), from the same finalized runs. Zero when the company
 * option is off or the base month has no finalized run.
 */
export interface ContributionExtras {
  sssCents: bigint;
  philHealthCents: bigint;
  pagibigCents: bigint;
}

export type SssBasis = (
  | {
      kind: "PREVIOUS_MONTH_ACTUAL";
      /** YYYY-MM of the base month. */
      month: string;
      /** Basic (after unpaid days and lates) from finalized runs. */
      priorBasicCents: bigint;
    }
  | { kind: "NEW_HIRE_NO_SSS"; month: string }
  | { kind: "CONTRACTED_FALLBACK"; month: string }
) & { otherEarnings?: ContributionExtras };

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
}

/**
 * The base month for a run that DEDUCTS contributions: the month before the
 * deduction month. Call only when `isStatutoryDeducted` is true for this run.
 * The rule (first or second payday) does not change the base month.
 */
export function sssBaseMonth(
  cycle: PayFrequency,
  _rule: "FIRST_CUTOFF" | "SECOND_CUTOFF",
  periodStart: Date,
  periodEnd: Date,
): SssBaseMonth {
  // The deduction month: the month of the period end, except WEEKLY/DAILY,
  // which deduct on the run containing a month's last day (month-end anchor).
  let y = periodEnd.getUTCFullYear();
  let m = periodEnd.getUTCMonth();
  if (cycle === "WEEKLY" || cycle === "DAILY") {
    const lastOfStartMonth = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
    );
    if (utcDay(lastOfStartMonth) <= utcDay(periodEnd)) {
      y = periodStart.getUTCFullYear();
      m = periodStart.getUTCMonth();
    }
  }
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  return { monthStart, monthEnd, month: monthKey(monthStart) };
}

/**
 * Decides the SSS basis for one employee from their finalized sheets that
 * overlap the base month. `sheets` must not include the run being computed.
 */
export function assessSssBasis(args: {
  base: SssBaseMonth;
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

  // Runs counted for the base: those that start inside the base month. A
  // weekly period that starts in the month and ends in the next belongs to the
  // month it starts in, so no week is counted twice.
  const counted = sheets.filter((s) => {
    const st = utcDay(s.periodStart);
    return st >= mStart && st <= mEnd;
  });

  // Coverage: every employed day is inside a finalized REGULAR run.
  const covered = new Set<number>();
  for (const s of sheets) {
    if (s.runType !== "REGULAR") continue;
    for (let d = Math.max(utcDay(s.periodStart), empFrom); d <= Math.min(utcDay(s.periodEnd), empTo); d++) covered.add(d);
  }
  const needed = Math.max(0, empTo - empFrom + 1);
  if (covered.size < needed) {
    return { kind: "CONTRACTED_FALLBACK", month: base.month };
  }

  const priorBasicCents = counted.reduce(
    (sum, s) => sum + (s.basicCents > 0n ? s.basicCents : 0n),
    0n,
  );
  return { kind: "PREVIOUS_MONTH_ACTUAL", month: base.month, priorBasicCents };
}

/**
 * The compensation the SSS table is looked up with, or null for no SSS.
 * This run's own pay never enters it: the base is always last month's.
 */
/**
 * PAY-202 (Mark, 20 Nov 2026, ruling 4): "the basic pay less lates is the
 * basic pay for the cutoff. Meaning it will be the base computation for tax,
 * sss, philhealth, and 13th month." PhilHealth uses the same base month as
 * SSS: the previous month's basic after unpaid days and lates. Where SSS has
 * none (a new hire's first month, or no basic earned in the base month) and
 * where the base month is not in Sentire, PhilHealth stays on the contracted
 * monthly basic, so no month of employment is left without a premium.
 * Reading taken without a ruling for those cases, flagged to Mark.
 */
export function philHealthCompensationCents(basis: SssBasis | undefined, contractedMonthlyCents: bigint): bigint {
  if (basis?.kind === "PREVIOUS_MONTH_ACTUAL" && basis.priorBasicCents > 0n) return basis.priorBasicCents;
  return contractedMonthlyCents;
}

export function sssCompensationCents(
  basis: SssBasis | undefined,
  contractedMonthlyCents: bigint,
): bigint | null {
  if (!basis || basis.kind === "CONTRACTED_FALLBACK") return contractedMonthlyCents;
  if (basis.kind === "NEW_HIRE_NO_SSS") return null;
  return basis.priorBasicCents > 0n ? basis.priorBasicCents : null;
}
