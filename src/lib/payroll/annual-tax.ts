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
