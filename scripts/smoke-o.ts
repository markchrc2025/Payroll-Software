/**
 * smoke-o.ts — Phase O: Year-End Annualization
 *
 * Tests the year-end WHT true-up feature end-to-end via library functions.
 *
 *  T1.  Pure computation: zero taxable income → zero liability, zero true-up
 *  T2.  Pure computation: known taxable income → trueAnnualLiability > 0
 *  T3.  Pure computation: isRefund flag is set when true-up < 0
 *  T4.  Seed PeriodInput for Roberto — Jan 2027 (MONTHLY)
 *  T5.  Create + finalize REGULAR run Jan 2027 for Roberto
 *  T6.  REGULAR sheet has grossTaxableIncomeCents > 0
 *  T7.  REGULAR sheet withholdingTaxCents > 0
 *  T8.  Create + finalize YEAR_END run Dec 2027 for Roberto
 *  T9.  YEAR_END sheet has nontaxable13MonthAndBenefitsCents > 0
 *  T10. runAnnualization() returns employeeCount = 1
 *  T11. runAnnualization() returns skippedMweCount = 0 (no MWE employees)
 *  T12. YEAR_END sheet annualizationData is now non-null
 *  T13. annualizationData.ytdRegularTaxableCents = REGULAR sheet's grossTaxableIncomeCents
 *  T14. annualizationData.ytdRegularWhtCents = REGULAR sheet's withholdingTaxCents
 *  T15. annualizationData.trueAnnualLiabilityCents > 0
 *  T16. trueUpCents = trueAnnualLiabilityCents − ytdRegularWhtCents
 *  T17. YEAR_END sheet withholdingTaxCents updated by true-up
 *  T18. YEAR_END sheet netPayCents adjusted by true-up
 *  T19. Idempotency: re-running annualization gives same result
 *  T20. runAnnualization on non-existent book → AnnualizationBookNotFoundError
 *  T21. runAnnualization on REGULAR book → AnnualizationNotYearEndError
 *  T22. runAnnualization on DRAFT YEAR_END book → AnnualizationNotFinalizedError
 *  T23. netTrueUpCents = sum of all employee true-ups
 *  T24. annualizationData.annualizedAt is a valid ISO datetime
 *  T25. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-o.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
} from "../src/lib/payroll/persist.js";
import {
  computeAnnualizationTrueUp,
  runAnnualization,
  AnnualizationBookNotFoundError,
  AnnualizationNotYearEndError,
  AnnualizationNotFinalizedError,
  type AnnualizationDataJson,
} from "../src/lib/payroll/annualize.js";
import { lookupBIR } from "../src/lib/statutory/compute.js";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_ID = process.env.SMOKE_TENANT_ID ?? "cmpowoufh0000zh73pmyoc6jr";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "cmpowpaos00117f736bbuppaf";

// Use 2027 to avoid conflicts with other smoke tests.
const YEAR = 2027;
const P_REGULAR_START = new Date(`${YEAR}-01-01T00:00:00.000Z`);
const P_REGULAR_END   = new Date(`${YEAR}-01-31T23:59:59.999Z`);
const P_YEAR_END_START = new Date(`${YEAR}-12-01T00:00:00.000Z`);
const P_YEAR_END_END   = new Date(`${YEAR}-12-31T23:59:59.999Z`);

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let failures = 0;
let total = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(`  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// withTenant helper
// ---------------------------------------------------------------------------
async function withT<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function seedPeriodInput(periodStart: Date, periodEnd: Date) {
  await withT(TENANT_ID, async (tx) => {
    await tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: TENANT_ID,
          employeeId: ROBERTO_ID,
          periodStart,
          periodEnd,
        },
      },
      update: { daysWorked: 22 },
      create: {
        tenantId: TENANT_ID,
        employeeId: ROBERTO_ID,
        periodStart,
        periodEnd,
        daysWorked: 22,
        regularOtHours: 0,
        restDayHours: 0,
        specialHolidayHours: 0,
        regularHolidayHours: 0,
        nightDiffHours: 0,
        hazardHours: 0,
        lateUndertimeMinutes: 0,
        unpaidLeaveDays: 0,
      },
    });
  });
}

async function getSheet(bookId: string, employeeId: string) {
  return withT(TENANT_ID, async (tx) => {
    return tx.payrollSheet.findUnique({
      where: {
        payrollBookId_employeeId: { payrollBookId: bookId, employeeId },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=== smoke-o.ts: Year-End Annualization ===\n");

  // Retrieve BIR rules for pure computation tests.
  const birRule = await withT(TENANT_ID, async (tx) => {
    const rules = await tx.statutoryRule.findFirst({
      where: { category: "BIR_WITHHOLDING_TABLE", tenantId: null },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!rules) throw new Error("BIR_WITHHOLDING_TABLE rule not found");
    return rules;
  });
  const birPayload = birRule.payload as Parameters<typeof computeAnnualizationTrueUp>[2];

  // -- T1: Pure computation, zero taxable income --
  console.log("T1: Pure computation — zero taxable income");
  {
    const r = computeAnnualizationTrueUp(0n, 0n, birPayload);
    check("T1 trueAnnualLiabilityCents = 0", r.trueAnnualLiabilityCents === 0n);
    check("T1 trueUpCents = 0", r.trueUpCents === 0n);
    check("T1 isRefund = false", r.isRefund === false);
  }

  // -- T2: Pure computation, known income --
  console.log("T2: Pure computation — ₱50,000/month × 12 = ₱600,000 annual");
  {
    // Roberto earns ₱50,000/month. Annual taxable ≈ 600k.
    // TRAIN: above 400k up to 800k: fixed 30k + 25% of excess over 400k.
    // Annual taxable: 600k pesos = 60,000,000 centavos.
    const ytdTaxable = 6_000_000_000n; // 60,000,000.00 centavos = ₱600,000
    // Actually 50000 pesos/month, so 60000 * 100 = 6000000 centavos/month
    // 12 months: 72000000 centavos = ₱720,000 annual
    // Let us use: 6000000n/month * 12 months = 72000000n annual taxable (₱720,000)
    // But actually we test with a simple value: 30000000n annual (₱300k).
    const ytdTax = 30_000_000n; // 300,000 centavos = ₱3,000 WHT paid
    const r = computeAnnualizationTrueUp(ytdTax * 12n, ytdTax, birPayload);
    check("T2 trueAnnualLiabilityCents > 0", r.trueAnnualLiabilityCents > 0n, r.trueAnnualLiabilityCents);
    check("T2 ytdRegularTaxableCents correct", r.ytdRegularTaxableCents === ytdTax * 12n);
  }

  // -- T3: Pure computation, over-withheld → refund --
  console.log("T3: Pure computation — over-withheld → isRefund = true");
  {
    // Pass a very high YTD WHT vs low taxable → refund
    const r = computeAnnualizationTrueUp(100_000n, 999_999_999n, birPayload);
    check("T3 isRefund = true", r.isRefund === true, `trueUp=${r.trueUpCents}`);
    check("T3 trueUpCents < 0", r.trueUpCents < 0n);
  }

  // -- T4: Seed PeriodInput --
  console.log("T4: Seed PeriodInput for Roberto Jan 2027");
  await seedPeriodInput(P_REGULAR_START, P_REGULAR_END);
  check("T4 PeriodInput seeded", true);

  // -- T5: Create + finalize REGULAR run --
  console.log("T5: Create & finalize REGULAR run Jan 2027");
  let regularBookId = "";
  {
    const book = await createDraftRun({
      tenantId: TENANT_ID,
      periodStart: P_REGULAR_START,
      periodEnd: P_REGULAR_END,
      cycle: "MONTHLY",
      runType: "REGULAR",
      employeeIds: [ROBERTO_ID],
    });
    regularBookId = book.id;
    await finalizeRun(TENANT_ID, book.id, null);
    check("T5 REGULAR book created and finalized", !!book.id, book.id);
  }

  // -- T6 & T7: REGULAR sheet taxable income and WHT > 0 --
  console.log("T6–T7: Verify REGULAR sheet figures");
  const regularSheet = await getSheet(regularBookId, ROBERTO_ID);
  check("T6 regularSheet exists", !!regularSheet);
  check("T6 grossTaxableIncomeCents > 0", (regularSheet?.grossTaxableIncomeCents ?? 0n) > 0n,
    regularSheet?.grossTaxableIncomeCents);
  check("T7 withholdingTaxCents > 0", (regularSheet?.withholdingTaxCents ?? 0n) > 0n,
    regularSheet?.withholdingTaxCents);

  // -- T8 & T9: Create + finalize YEAR_END run --
  console.log("T8–T9: Create & finalize YEAR_END run Dec 2027");
  let yearEndBookId = "";
  {
    const book = await createDraftRun({
      tenantId: TENANT_ID,
      periodStart: P_YEAR_END_START,
      periodEnd: P_YEAR_END_END,
      cycle: "MONTHLY",
      runType: "YEAR_END",
      employeeIds: [ROBERTO_ID],
    });
    yearEndBookId = book.id;
    await finalizeRun(TENANT_ID, book.id, null);
    check("T8 YEAR_END book created and finalized", !!book.id, book.id);
  }

  const yearEndSheetBefore = await getSheet(yearEndBookId, ROBERTO_ID);
  check("T9 nontaxable13MonthAndBenefitsCents > 0",
    (yearEndSheetBefore?.nontaxable13MonthAndBenefitsCents ?? 0n) > 0n,
    yearEndSheetBefore?.nontaxable13MonthAndBenefitsCents);

  // Capture baseline WHT before annualization.
  const baselineWht    = yearEndSheetBefore?.withholdingTaxCents ?? 0n;
  const baselineNetPay = yearEndSheetBefore?.netPayCents ?? 0n;

  // -- T10 & T11: runAnnualization returns summary --
  console.log("T10–T11: Run annualization");
  const summary = await runAnnualization(TENANT_ID, yearEndBookId);
  check("T10 employeeCount = 1", summary.employeeCount === 1, summary.employeeCount);
  check("T11 skippedMweCount = 0", summary.skippedMweCount === 0, summary.skippedMweCount);

  // -- T12–T18: Verify annualizationData on YEAR_END sheet --
  console.log("T12–T18: Verify YEAR_END sheet after annualization");
  const yearEndSheetAfter = await getSheet(yearEndBookId, ROBERTO_ID);
  check("T12 annualizationData is non-null", yearEndSheetAfter?.annualizationData !== null);

  const annData = yearEndSheetAfter?.annualizationData as AnnualizationDataJson | null;
  const ytdRegularTaxable = BigInt(annData?.ytdRegularTaxableCents ?? "0");
  const ytdRegularWht     = BigInt(annData?.ytdRegularWhtCents ?? "0");
  const trueAnnualLiab    = BigInt(annData?.trueAnnualLiabilityCents ?? "0");
  const trueUp            = BigInt(annData?.trueUpCents ?? "0");

  check("T13 ytdRegularTaxableCents = regularSheet.grossTaxableIncomeCents",
    ytdRegularTaxable === (regularSheet?.grossTaxableIncomeCents ?? -1n),
    `${ytdRegularTaxable} vs ${regularSheet?.grossTaxableIncomeCents}`);

  check("T14 ytdRegularWhtCents = regularSheet.withholdingTaxCents",
    ytdRegularWht === (regularSheet?.withholdingTaxCents ?? -1n),
    `${ytdRegularWht} vs ${regularSheet?.withholdingTaxCents}`);

  check("T15 trueAnnualLiabilityCents = formula result (lookupBIR(ytdTaxable/12) × 12)",
    (() => {
      // Replicate the annualization formula.
      if (ytdRegularTaxable === 0n) return trueAnnualLiab === 0n;
      const monthly = ytdRegularTaxable / 12n;
      const expected = lookupBIR(birPayload, "MONTHLY", monthly).tax * 12n;
      return trueAnnualLiab === expected;
    })(),
    `trueAnnualLiab=${trueAnnualLiab}`);

  check("T16 trueUpCents = trueAnnualLiability − ytdRegularWht",
    trueUp === trueAnnualLiab - ytdRegularWht,
    `${trueUp} = ${trueAnnualLiab} - ${ytdRegularWht}`);

  check("T17 YEAR_END withholdingTaxCents updated by trueUp",
    (yearEndSheetAfter?.withholdingTaxCents ?? -1n) === baselineWht + trueUp,
    `${yearEndSheetAfter?.withholdingTaxCents} vs ${baselineWht + trueUp}`);

  check("T18 YEAR_END netPayCents adjusted by trueUp",
    (yearEndSheetAfter?.netPayCents ?? -1n) === baselineNetPay - trueUp,
    `${yearEndSheetAfter?.netPayCents} vs ${baselineNetPay - trueUp}`);

  // -- T19: Idempotency --
  console.log("T19: Idempotency — re-run annualization");
  const summary2 = await runAnnualization(TENANT_ID, yearEndBookId);
  const yearEndSheetAfter2 = await getSheet(yearEndBookId, ROBERTO_ID);
  const annData2 = yearEndSheetAfter2?.annualizationData as AnnualizationDataJson | null;

  check("T19a same employeeCount", summary2.employeeCount === summary.employeeCount);
  check("T19b same trueUpCents",
    annData2?.trueUpCents === annData?.trueUpCents,
    `first=${annData?.trueUpCents} second=${annData2?.trueUpCents}`);
  check("T19c withholdingTaxCents unchanged after re-run",
    yearEndSheetAfter2?.withholdingTaxCents === yearEndSheetAfter?.withholdingTaxCents,
    `${yearEndSheetAfter2?.withholdingTaxCents}`);

  // -- T20: Non-existent book → AnnualizationBookNotFoundError --
  console.log("T20: Non-existent book → error");
  try {
    await runAnnualization(TENANT_ID, "nonexistentbookid000000000");
    check("T20 should have thrown", false);
  } catch (e) {
    check("T20 AnnualizationBookNotFoundError", e instanceof AnnualizationBookNotFoundError, String(e));
  }

  // -- T21: REGULAR book → AnnualizationNotYearEndError --
  console.log("T21: REGULAR book → AnnualizationNotYearEndError");
  try {
    await runAnnualization(TENANT_ID, regularBookId);
    check("T21 should have thrown", false);
  } catch (e) {
    check("T21 AnnualizationNotYearEndError", e instanceof AnnualizationNotYearEndError, String(e));
  }

  // -- T22: DRAFT YEAR_END book → AnnualizationNotFinalizedError --
  console.log("T22: DRAFT YEAR_END book → AnnualizationNotFinalizedError");
  {
    // Use December 2027 2nd half as a separate YEAR_END draft (different period)
    const draftBook = await createDraftRun({
      tenantId: TENANT_ID,
      periodStart: new Date(`${YEAR}-11-01T00:00:00.000Z`),
      periodEnd:   new Date(`${YEAR}-11-30T23:59:59.999Z`),
      cycle: "MONTHLY",
      runType: "YEAR_END",
      employeeIds: [ROBERTO_ID],
    });
    try {
      await runAnnualization(TENANT_ID, draftBook.id);
      check("T22 should have thrown", false);
    } catch (e) {
      check("T22 AnnualizationNotFinalizedError", e instanceof AnnualizationNotFinalizedError, String(e));
    }

    // Cleanup draft book
    await withT(TENANT_ID, async (tx) => {
      await tx.payrollBook.delete({ where: { id: draftBook.id, tenantId: TENANT_ID } });
    });
  }

  // -- T23: netTrueUpCents in summary --
  console.log("T23: summary.netTrueUpCents");
  check("T23 netTrueUpCents = trueUpCents (single employee)",
    summary.netTrueUpCents === trueUp,
    `${summary.netTrueUpCents} vs ${trueUp}`);

  // -- T24: annualizationData.annualizedAt is valid ISO --
  console.log("T24: annualizedAt is a valid ISO datetime");
  {
    const d = new Date(annData?.annualizedAt ?? "");
    check("T24 annualizedAt is valid date", !isNaN(d.getTime()), annData?.annualizedAt);
  }

  // -- T25: Cleanup --
  console.log("T25: Cleanup");
  await withT(TENANT_ID, async (tx) => {
    await tx.payrollBook.delete({ where: { id: yearEndBookId, tenantId: TENANT_ID } });
    await tx.payrollBook.delete({ where: { id: regularBookId, tenantId: TENANT_ID } });
    await tx.periodInput.deleteMany({
      where: {
        tenantId: TENANT_ID,
        employeeId: ROBERTO_ID,
        periodStart: P_REGULAR_START,
        periodEnd: P_REGULAR_END,
      },
    });
  });
  check("T25 cleanup done", true);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n${failures === 0 ? "✅" : "❌"}  ${total - failures}/${total} PASS`);
  if (failures > 0) process.exitCode = 1;

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
