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
