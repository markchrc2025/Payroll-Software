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

import { annualTaxDueCents } from "./annual-tax";
import { getActiveRule } from "@/lib/statutory/resolver";
import { withTenant, type TenantTx } from "@/lib/with-tenant";
import { BirWithholdingPayload } from "@/lib/statutory/types";
import { loadYtdOpeningsByEmployee, ytdOpeningTotals } from "./ytd-openings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnualizationResult {
  /** Sum of grossTaxableIncomeCents from all finalized REGULAR/OFF_CYCLE runs,
   *  plus year-to-date openings (PAY-144). */
  ytdRegularTaxableCents: bigint;
  /** Sum of withholdingTaxCents from all finalized REGULAR/OFF_CYCLE runs,
   *  plus year-to-date openings (PAY-144). */
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
  /**
   * PAY-144: of the year's taxable income and tax withheld above, the part
   * that came from year-to-date openings (pay before Sentire and a previous
   * employer's 2316). Absent on annualizations run before PAY-144.
   */
  ytdOpeningTaxableCents?: string;
  ytdOpeningWhtCents?: string;
  /**
   * PAY-154: of the totals above, this 13th month run's own taxable pay (the
   * excess over the 90,000) and the tax it withheld before the true-up.
   * Absent on annualizations run before PAY-154.
   */
  yearEndTaxableCents?: string;
  yearEndBaselineWhtCents?: string;
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
  // Annualized TRAIN method: monthly equivalent, bracket, times 12
  // (shared with the engine since PAY-154/PAY-156: annual-tax.ts).
  const trueAnnualLiabilityCents = annualTaxDueCents(birPayload, ytdRegularTaxableCents);

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
/**
 * PAY-155 (Mark, 17 Nov 2026 Q1b): a finalized run is a sealed record and is
 * never changed. Annualization therefore runs on the 13th month run while it
 * is still a DRAFT, before it is finalized.
 */
export class AnnualizationSealedError extends Error {
  constructor() {
    super(
      "This 13th month run is finalized, and a finalized run is never changed. " +
        "Annualize a 13th month run while it is still a draft, then finalize it.",
    );
  }
}
export class AnnualizationNotDraftError extends Error {
  constructor(status: string) {
    super(`Only a draft 13th month run can be annualized (this one is ${status}).`);
  }
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

type Tx = TenantTx;

/** One sheet's planned annualization (nothing written yet). */
export interface PlannedSheet {
  sheetId: string;
  employeeId: string;
  skipped: boolean; // MWE
  baseWht: bigint;
  baseNetPay: bigint;
  result: AnnualizationResult | null;
  annData: AnnualizationDataJson | null;
  /** The true-up stored on the sheet now, or null if never annualized. */
  storedTrueUpCents: bigint | null;
  storedYtdTaxableCents: bigint | null;
  storedYtdWhtCents: bigint | null;
}

/**
 * Work out the year-end true-up for every sheet of a YEAR_END book without
 * writing anything. Used by runAnnualization() to write it and by
 * finalizeRun() to check that a stored true-up is still current (PAY-155).
 */
export async function planAnnualization(
  tx: Tx,
  tenantId: string,
  book: { id: string; periodEnd: Date },
): Promise<PlannedSheet[]> {
  const bookId = book.id;
  const year = book.periodEnd.getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const birRule = await getActiveRule(tx, tenantId, "BIR_WITHHOLDING_TABLE", book.periodEnd);
  const birPayload = BirWithholdingPayload.parse(birRule.payload);

  const yearEndSheets = await tx.payrollSheet.findMany({
    where: { payrollBookId: bookId, tenantId },
    select: {
      id: true,
      employeeId: true,
      withholdingTaxCents: true,
      netPayCents: true,
      grossTaxableIncomeCents: true,
      taxClassificationSnapshot: true,
      annualizationData: true,
    },
  });

  // PAY-144: year-to-date openings for everyone in the book.
  const openingsByEmployee = await loadYtdOpeningsByEmployee(
    tx,
    tenantId,
    year,
    yearEndSheets.map((s) => s.employeeId),
  );

  const now = new Date().toISOString();
  const planned: PlannedSheet[] = [];

  for (const sheet of yearEndSheets) {
    const prev = sheet.annualizationData as unknown as AnnualizationDataJson | null;
    const stored = {
      storedTrueUpCents: prev ? BigInt(prev.trueUpCents) : null,
      storedYtdTaxableCents: prev ? BigInt(prev.ytdRegularTaxableCents) : null,
      storedYtdWhtCents: prev ? BigInt(prev.ytdRegularWhtCents) : null,
    };

    // Skip MWE employees.
    if (sheet.taxClassificationSnapshot === "MWE") {
      planned.push({
        sheetId: sheet.id, employeeId: sheet.employeeId, skipped: true,
        baseWht: sheet.withholdingTaxCents, baseNetPay: sheet.netPayCents,
        result: null, annData: null, ...stored,
      });
      continue;
    }

    // Reverse any prior annualization to get the engine-baseline WHT/net.
    let baseWht    = sheet.withholdingTaxCents;
    let baseNetPay = sheet.netPayCents;
    if (prev) {
      baseWht    -= BigInt(prev.trueUpCents);
      baseNetPay += BigInt(prev.trueUpCents);
    }

    // Sum YTD taxable + WHT from the year's other finalized runs.
    const priorSheets = await tx.payrollSheet.findMany({
      where: {
        tenantId,
        employeeId: sheet.employeeId,
        payrollBookId: { not: bookId },
        payrollBook: {
          status: "FINALIZED",
          // PAY-154: other 13th month runs of the year count too.
          runType: { in: ["REGULAR", "OFF_CYCLE", "YEAR_END"] },
          periodEnd: { gte: yearStart, lte: yearEnd },
        },
      },
      select: { grossTaxableIncomeCents: true, withholdingTaxCents: true },
    });

    // PAY-144: pay before Sentire and a previous employer's 2316 start the sums.
    const opening = ytdOpeningTotals(openingsByEmployee.get(sheet.employeeId) ?? []);
    // PAY-154: this run's own taxable 13th month excess and the tax it
    // withheld before the true-up belong to the year too.
    let ytdRegularTaxableCents = opening.taxableCompensationCents + sheet.grossTaxableIncomeCents;
    let ytdRegularWhtCents     = opening.withholdingTaxCents + baseWht;
    for (const ps of priorSheets) {
      ytdRegularTaxableCents += ps.grossTaxableIncomeCents;
      ytdRegularWhtCents     += ps.withholdingTaxCents;
    }

    const result = computeAnnualizationTrueUp(ytdRegularTaxableCents, ytdRegularWhtCents, birPayload);

    const annData: AnnualizationDataJson = {
      year,
      ytdRegularTaxableCents: result.ytdRegularTaxableCents.toString(),
      ytdRegularWhtCents:     result.ytdRegularWhtCents.toString(),
      trueAnnualLiabilityCents: result.trueAnnualLiabilityCents.toString(),
      trueUpCents:            result.trueUpCents.toString(),
      isRefund:               result.isRefund,
      annualizedAt:           now,
      ytdOpeningTaxableCents: opening.taxableCompensationCents.toString(),
      ytdOpeningWhtCents:     opening.withholdingTaxCents.toString(),
      yearEndTaxableCents:    sheet.grossTaxableIncomeCents.toString(),
      yearEndBaselineWhtCents: baseWht.toString(),
    };

    planned.push({
      sheetId: sheet.id, employeeId: sheet.employeeId, skipped: false,
      baseWht, baseNetPay, result, annData, ...stored,
    });
  }
  return planned;
}

/**
 * PAY-155: the employees of a YEAR_END book whose stored true-up no longer
 * matches the year's figures (another run of the year was finalized, an
 * opening changed, or the tax table changed since). Empty when the book was
 * never annualized or every stored true-up is current.
 */
export async function staleAnnualizations(
  tx: Tx,
  tenantId: string,
  book: { id: string; periodEnd: Date },
): Promise<string[]> {
  const planned = await planAnnualization(tx, tenantId, book);
  const annualized = planned.filter((p) => p.storedTrueUpCents !== null);
  if (annualized.length === 0) return [];
  return planned
    .filter((p) => !p.skipped)
    .filter((p) =>
      p.storedTrueUpCents === null ||
      p.storedTrueUpCents !== p.result!.trueUpCents ||
      p.storedYtdTaxableCents !== p.result!.ytdRegularTaxableCents ||
      p.storedYtdWhtCents !== p.result!.ytdRegularWhtCents,
    )
    .map((p) => p.employeeId);
}

/**
 * Run year-end annualization for all employees in a DRAFT YEAR_END book.
 *
 * PAY-155 (Mark, 17 Nov 2026): a finalized run is a sealed record, so the
 * true-up is written while the 13th month run is still a draft; finalizing
 * then seals it. A finalized book is refused (AnnualizationSealedError).
 *
 * Updates each PayrollSheet in the book:
 *   • annualizationData — filled with the true-up calculation details
 *   • withholdingTaxCents = engine WHT + trueUpCents  (negative = refund)
 *   • netPayCents         = engine net  − trueUpCents
 *
 * Idempotent: re-running reverses any prior true-up stored in
 * annualizationData, then applies the freshly computed one. Recomputing the
 * draft rebuilds its sheets, which clears the true-up.
 */
export async function runAnnualization(
  tenantId: string,
  bookId: string,
): Promise<AnnualizationSummary> {
  return withTenant(tenantId, async (tx) => {
    // Lock the book so finalize cannot seal it halfway through.
    await tx.$queryRaw`SELECT id FROM "PayrollBook" WHERE id = ${bookId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const book = await tx.payrollBook.findFirst({
      where: { id: bookId, tenantId },
      select: { id: true, runType: true, status: true, periodEnd: true },
    });
    if (!book) throw new AnnualizationBookNotFoundError();
    if (book.runType !== "YEAR_END") throw new AnnualizationNotYearEndError();
    if (book.status === "FINALIZED") throw new AnnualizationSealedError();
    if (book.status !== "DRAFT") throw new AnnualizationNotDraftError(book.status);

    const planned = await planAnnualization(tx, tenantId, book);

    for (const p of planned) {
      if (p.skipped) continue;
      await tx.payrollSheet.update({
        where: { id: p.sheetId },
        data: {
          withholdingTaxCents: p.baseWht + p.result!.trueUpCents,
          netPayCents:         p.baseNetPay - p.result!.trueUpCents,
          annualizationData:   p.annData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    }

    const processed       = planned.filter((p) => !p.skipped).map((p) => p.result!.trueUpCents);
    return {
      year: book.periodEnd.getFullYear(),
      bookId,
      employeeCount: processed.length,
      skippedMweCount: planned.filter((p) => p.skipped).length,
      refundCount: processed.filter((t) => t < 0n).length,
      shortfallCount: processed.filter((t) => t > 0n).length,
      noChangeCount: processed.filter((t) => t === 0n).length,
      netTrueUpCents: processed.reduce((acc, t) => acc + t, 0n),
    };
  });
}
