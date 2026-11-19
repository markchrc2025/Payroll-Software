/**
 * Tax due for a whole year's taxable compensation (pure, no database).
 *
 * The BIR table in force has per-period brackets (DAILY to MONTHLY) and no
 * annual table, so the year's tax is the MONTHLY table applied to one twelfth
 * of the year's taxable pay, times 12. This is the method year-end
 * annualization (annualize.ts) and final pay already used; PAY-154 and PAY-156
 * share it from here so the three never drift apart.
 */
import { lookupBIR } from "@/lib/statutory/compute";
import type { BirWithholdingPayload } from "@/lib/statutory/types";

export function annualTaxDueCents(bir: BirWithholdingPayload, annualTaxableCents: bigint): bigint {
  if (annualTaxableCents <= 0n) return 0n;
  // PAY-171: the annual table, when the rule has one, is exact.
  const annual = bir.frequencies.ANNUAL;
  if (annual) {
    let bracket = annual[0]!;
    for (const b of annual) if (annualTaxableCents >= BigInt(b.floor)) bracket = b;
    const over = annualTaxableCents - BigInt(bracket.floor);
    // Rate times the excess, rounded half up to the centavo.
    const rateBp = BigInt(Math.round(bracket.plusRate * 1_000_000));
    return BigInt(bracket.fixedTax) + (over * rateBp + 500_000n) / 1_000_000n;
  }
  return lookupBIR(bir, "MONTHLY", annualTaxableCents / 12n).tax * 12n;
}

/**
 * PAY-154: the tax that `extraTaxableCents` adds on top of what the year
 * already earned (`priorTaxableCents`), at the employee's own rate for the
 * year. Never negative.
 */
export function marginalAnnualTaxCents(
  bir: BirWithholdingPayload,
  priorTaxableCents: bigint,
  extraTaxableCents: bigint,
): bigint {
  if (extraTaxableCents <= 0n) return 0n;
  const prior = priorTaxableCents > 0n ? priorTaxableCents : 0n;
  const due = annualTaxDueCents(bir, prior + extraTaxableCents) - annualTaxDueCents(bir, prior);
  return due > 0n ? due : 0n;
}

/** Pay periods in a year for cycles the BIR table has no column for. */
const PERIODS_PER_YEAR_WITHOUT_TABLE: Partial<Record<string, bigint>> = {
  BI_WEEKLY: 26n,
};

/**
 * PAY-134 (Mark, 17 Nov 2026: option A): the tax withheld in one pay period.
 * Cycles with their own column in the BIR table (DAILY, WEEKLY, SEMI_MONTHLY,
 * MONTHLY) use it. BI_WEEKLY has no column, so its tax is annualized: the
 * period's taxable pay times 26 is taxed for the year (annualTaxDueCents),
 * and one twenty-sixth of that tax is withheld (rounded half up to the
 * centavo). The bracket returned is the MONTHLY bracket the year falls in.
 */
export function periodWithholdingTax(
  bir: BirWithholdingPayload,
  cycle: string,
  taxableCents: bigint,
): { tax: bigint; bracket: { floor: bigint; fixedTax: bigint; plusRate: number } } {
  const periods = PERIODS_PER_YEAR_WITHOUT_TABLE[cycle];
  if (periods === undefined) {
    const r = lookupBIR(bir, cycle as Parameters<typeof lookupBIR>[1], taxableCents);
    return { tax: r.tax, bracket: r.bracket };
  }
  const annual = taxableCents * periods;
  const annualTax = annualTaxDueCents(bir, annual);
  const tax = (annualTax + periods / 2n) / periods;
  const bracket = lookupBIR(bir, "MONTHLY", annual / 12n).bracket;
  return { tax, bracket };
}

/**
 * PAY-171: pay periods in a year, and how many are already past before a
 * period starting on `start` (UTC calendar). Used to project the year's
 * regular taxable pay, so a bonus's taxable excess is taxed at the rate the
 * employee will be in for the year (Mark's Smart payslips, finding 2), not at
 * the rate of what happened to be earned so far.
 */
export function periodsPerYear(cycle: string): bigint {
  switch (cycle) {
    case "DAILY": return 313n;
    case "WEEKLY": return 52n;
    case "BI_WEEKLY": return 26n;
    case "SEMI_MONTHLY": return 24n;
    default: return 12n;
  }
}

export function periodsElapsedBefore(cycle: string, start: Date): bigint {
  const month = BigInt(start.getUTCMonth());
  const dayOfYear = BigInt(
    Math.floor((Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) - Date.UTC(start.getUTCFullYear(), 0, 1)) / 86_400_000),
  );
  switch (cycle) {
    case "SEMI_MONTHLY": return month * 2n + (start.getUTCDate() > 15 ? 1n : 0n);
    case "MONTHLY": return month;
    case "WEEKLY": return dayOfYear / 7n;
    case "BI_WEEKLY": return dayOfYear / 14n;
    case "DAILY": return (dayOfYear * 313n) / 365n;
    default: return month;
  }
}

/**
 * PAY-171: the year's regular taxable pay, projected: what earlier finalized
 * runs taxed this year, plus this period's regular taxable pay for this and
 * every later period of the year.
 */
export function projectedAnnualTaxableCents(
  cycle: string,
  periodStart: Date,
  priorYtdTaxableCents: bigint,
  periodRegularTaxableCents: bigint,
): bigint {
  const left = periodsPerYear(cycle) - periodsElapsedBefore(cycle, periodStart);
  const remaining = left > 0n ? left : 1n;
  const prior = priorYtdTaxableCents > 0n ? priorYtdTaxableCents : 0n;
  const period = periodRegularTaxableCents > 0n ? periodRegularTaxableCents : 0n;
  return prior + period * remaining;
}
