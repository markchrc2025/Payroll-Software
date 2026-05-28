/**
 * Year-End Annualization (§4.4 TRAIN / BIR RR 11-2018)
 *
 * After all regular periods for the calendar year are finalized, the employer
 * must reconcile the per-period withholding taxes against the employee's true
 * annual income tax liability.  Any shortfall is collected (additional WHT);
 * any excess is refunded to the employee.
 *
 * This module provides:
 *  - `computeAnnualizationTrueUp()` — pure arithmetic (no DB calls).
 *  - `runAnnualization()` — DB-level orchestration called from the API route.
 */

import { lookupBIR } from "@/lib/statutory/compute";
import { getActiveRule } from "@/lib/statutory/resolver";
import { withTenant } from "@/lib/with-tenant";
import { BirWithholdingPayload } from "@/lib/statutory/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnualizationResult {
  /** Sum of grossTaxableIncomeCents from all finalized REGULAR/OFF_CYCLE runs. */
  ytdRegularTaxableCents: bigint;
  /** Sum of withholdingTaxCents from all finalized REGULAR/OFF_CYCLE runs. */
  ytdRegularWhtCents: bigint;
  /** True annual TRAIN tax liability on ytdRegularTaxableCents. */
  trueAnnualLiabilityCents: bigint;
  /** trueAnnualLiabilityCents − ytdRegularWhtCents.
   *  Positive → shortfall (additional deduction).
   *  Negative → over-withheld (refund). */
  trueUpCents: bigint;
  /** True when trueUpCents < 0 (employer owes a refund). */
  isRefund: boolean;
}

/** JSON shape stored in PayrollSheet.annualizationData */
export interface AnnualizationDataJson {
  year: number;
  ytdRegularTaxableCents: string;
  ytdRegularWhtCents: string;
  trueAnnualLiabilityCents: string;
  trueUpCents: string;
  isRefund: boolean;
  annualizedAt: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

/**
 * Compute the year-end WHT true-up for a single employee.
 *
 * Uses the MONTHLY BIR table annualized: tax = lookup(ytdTaxable / 12) × 12.
 * MWE employees are excluded by the caller (they pass ytdRegularTaxableCents=0n
 * and the result is correctly zero-liability).
 */
export function computeAnnualizationTrueUp(
  ytdRegularTaxableCents: bigint,
  ytdRegularWhtCents: bigint,
  birPayload: BirWithholdingPayload,
): AnnualizationResult {
  let trueAnnualLiabilityCents = 0n;

  if (ytdRegularTaxableCents > 0n) {
    // Annualized TRAIN method: compute monthly equivalent, look up bracket,
    // multiply by 12 to get annual liability.
    const monthlyEquivalent = ytdRegularTaxableCents / 12n;
    const birResult = lookupBIR(birPayload, "MONTHLY", monthlyEquivalent);
    trueAnnualLiabilityCents = birResult.tax * 12n;
  }

  const trueUpCents = trueAnnualLiabilityCents - ytdRegularWhtCents;

  return {
    ytdRegularTaxableCents,
    ytdRegularWhtCents,
    trueAnnualLiabilityCents,
    trueUpCents,
    isRefund: trueUpCents < 0n,
  };
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AnnualizationBookNotFoundError extends Error {
  constructor() { super("PayrollBook not found"); }
}
export class AnnualizationNotYearEndError extends Error {
  constructor() { super("PayrollBook is not a YEAR_END run"); }
}
export class AnnualizationNotFinalizedError extends Error {
  constructor() { super("PayrollBook must be FINALIZED before annualizing"); }
}

// ---------------------------------------------------------------------------
// DB-level orchestration
// ---------------------------------------------------------------------------

export interface AnnualizationSummary {
  year: number;
  bookId: string;
  employeeCount: number;
  skippedMweCount: number;
  refundCount: number;
  shortfallCount: number;
  noChangeCount: number;
  netTrueUpCents: bigint;
}

/**
 * Run year-end annualization for all employees in a FINALIZED YEAR_END book.
 *
 * Updates each PayrollSheet in the book:
 *   • annualizationData — filled with the true-up calculation details
 *   • withholdingTaxCents += trueUpCents  (negative = refund reduces WHT)
 *   • netPayCents         -= trueUpCents
 *
 * Idempotent: re-running overwrites annualizationData and resets WHT/net to
 * the YEAR_END engine-computed values before applying the new true-up.
 * (It re-derives the baseline by reversing any prior true-up stored in
 *  annualizationData, then applies the freshly computed one.)
 */
export async function runAnnualization(
  tenantId: string,
  bookId: string,
): Promise<AnnualizationSummary> {
  return withTenant(tenantId, async (tx) => {
    // 1. Load and validate the PayrollBook.
    const book = await tx.payrollBook.findFirst({
      where: { id: bookId, tenantId },
      select: { id: true, runType: true, status: true, periodEnd: true },
    });
    if (!book) throw new AnnualizationBookNotFoundError();
    if (book.runType !== "YEAR_END") throw new AnnualizationNotYearEndError();
    if (book.status !== "FINALIZED") throw new AnnualizationNotFinalizedError();

    const year = book.periodEnd.getFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // 2. Resolve BIR rules.
    const birRule = await getActiveRule(tx, tenantId, "BIR_WITHHOLDING_TABLE", book.periodEnd);
    const birPayload = BirWithholdingPayload.parse(birRule.payload);

    // 3. Load YEAR_END sheets.
    const yearEndSheets = await tx.payrollSheet.findMany({
      where: { payrollBookId: bookId, tenantId },
      select: {
        id: true,
        employeeId: true,
        withholdingTaxCents: true,
        netPayCents: true,
        taxClassificationSnapshot: true,
        annualizationData: true,
      },
    });

    const now = new Date().toISOString();
    const summaryRows: { trueUpCents: bigint; skipped: boolean }[] = [];

    for (const sheet of yearEndSheets) {
      // Skip MWE employees.
      if (sheet.taxClassificationSnapshot === "MWE") {
        summaryRows.push({ trueUpCents: 0n, skipped: true });
        continue;
      }

      // 4. Reverse any prior annualization to get the engine-baseline WHT/net.
      let baseWht    = sheet.withholdingTaxCents;
      let baseNetPay = sheet.netPayCents;
      if (sheet.annualizationData !== null) {
        const prev = sheet.annualizationData as unknown as AnnualizationDataJson;
        const prevTrueUp = BigInt(prev.trueUpCents);
        baseWht    -= prevTrueUp;
        baseNetPay += prevTrueUp;
      }

      // 5. Sum YTD regular taxable + WHT from prior REGULAR/OFF_CYCLE sheets.
      const priorSheets = await tx.payrollSheet.findMany({
        where: {
          tenantId,
          employeeId: sheet.employeeId,
          payrollBookId: { not: bookId },
          payrollBook: {
            status: "FINALIZED",
            runType: { in: ["REGULAR", "OFF_CYCLE"] },
            periodEnd: { gte: yearStart, lte: yearEnd },
          },
        },
        select: { grossTaxableIncomeCents: true, withholdingTaxCents: true },
      });

      let ytdRegularTaxableCents = 0n;
      let ytdRegularWhtCents     = 0n;
      for (const ps of priorSheets) {
        ytdRegularTaxableCents += ps.grossTaxableIncomeCents;
        ytdRegularWhtCents     += ps.withholdingTaxCents;
      }

      // 6. Compute true-up.
      const result = computeAnnualizationTrueUp(
        ytdRegularTaxableCents,
        ytdRegularWhtCents,
        birPayload,
      );

      const annData: AnnualizationDataJson = {
        year,
        ytdRegularTaxableCents: result.ytdRegularTaxableCents.toString(),
        ytdRegularWhtCents:     result.ytdRegularWhtCents.toString(),
        trueAnnualLiabilityCents: result.trueAnnualLiabilityCents.toString(),
        trueUpCents:            result.trueUpCents.toString(),
        isRefund:               result.isRefund,
        annualizedAt:           now,
      };

      // 7. Write back: baseline + new true-up.
      await tx.payrollSheet.update({
        where: { id: sheet.id },
        data: {
          withholdingTaxCents: baseWht + result.trueUpCents,
          netPayCents:         baseNetPay - result.trueUpCents,
          annualizationData:   annData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });

      summaryRows.push({ trueUpCents: result.trueUpCents, skipped: false });
    }

    const processed       = summaryRows.filter((r) => !r.skipped);
    const skippedMweCount = summaryRows.filter((r) => r.skipped).length;
    const refundCount     = processed.filter((r) => r.trueUpCents < 0n).length;
    const shortfallCount  = processed.filter((r) => r.trueUpCents > 0n).length;
    const noChangeCount   = processed.filter((r) => r.trueUpCents === 0n).length;
    const netTrueUpCents  = processed.reduce((acc, r) => acc + r.trueUpCents, 0n);

    return {
      year,
      bookId,
      employeeCount: processed.length,
      skippedMweCount,
      refundCount,
      shortfallCount,
      noChangeCount,
      netTrueUpCents,
    };
  });
}
