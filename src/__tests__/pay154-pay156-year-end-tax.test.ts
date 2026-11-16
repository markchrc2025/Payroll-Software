/**
 * PAY-154 and PAY-156 (Mark, 16 Nov 2026 23:22: "go and fix the tax issues
 * PAY-154 and PAY-156 next"), the pure parts. The real-database suite is
 * pay154-pay156-year-end-tax-db.test.ts.
 *
 *   A1  the year's tax due: the MONTHLY table on a twelfth, times 12 (the
 *       method annualization already used), and the marginal tax an extra
 *       amount adds on top of the year so far.
 *   Y1  (T1, PAY-154) the 13th month's taxable excess is taxed at the
 *       employee's rate for the year. QA-02 on staging: ₱17,677.04 taxable on
 *       top of about ₱260,000 for the year was withheld at ₱0.00, because the
 *       excess went through the MONTHLY table on its own.
 *   Y2  with no year-to-date figure the excess is taxed as if it were the
 *       year's only taxable pay.
 *   F1  (T1, PAY-156) final pay refunds tax withheld above the year's tax due:
 *       QA-01 on staging, ₱10,975.00 withheld against ₱4,725.60 due, so
 *       ₱6,249.40 comes back in the final pay.
 *   F2  a shortfall is still withheld (unchanged).
 *   P1  the payslip calls a negative withholding a tax refund, and its
 *       earnings and deductions still prove gross to net.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { lookupBIR } from "@/lib/statutory/compute";
import { annualTaxDueCents, marginalAnnualTaxCents } from "@/lib/payroll/annual-tax";
import { buildPayslipPdfData, type PayslipPdfSource } from "@/lib/payslip/pdf-data";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** The year's tax written out independently of annual-tax.ts. */
const yearTax = (taxable: bigint) => (taxable <= 0n ? 0n : lookupBIR(BIR, "MONTHLY", taxable / 12n).tax * 12n);

function input(extra: Partial<ComputeInput>): ComputeInput {
  return {
    employee: {
      id: "p154-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d("2025-01-06"),
      separationDate: null,
    },
    salary: { basicSalaryCents: 2_500_000n, salaryType: "MONTHLY" },
    tenant: {
      workingDaysDenominator: 261,
      statutoryCutoffRule: "FIRST_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
      allowNegativeFinalPay: true,
    },
    period: { start: d("2026-12-01"), end: d("2026-12-15"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 0,
      lateUndertimeMinutes: 0,
      regularOtHours: 0,
      restDayHours: 0,
      specialHolidayHours: 0,
      regularHolidayHours: 0,
      nightDiffHours: 0,
      hazardHours: 0,
      unpaidLeaveDays: 0,
    },
    payComponents: [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: false,
    ...extra,
  };
}

describe("PAY-154 and PAY-156: year-end and final pay tax", () => {
  it("A1 the year's tax due", () => {
    // ₱300,000 a year: ₱25,000 a month, 15% over ₱20,833 = ₱625.05, x 12.
    expect(annualTaxDueCents(BIR, 30_000_000n)).toBe(62_505n * 12n);
    expect(annualTaxDueCents(BIR, 30_000_000n)).toBe(yearTax(30_000_000n));
    expect(annualTaxDueCents(BIR, 0n)).toBe(0n);
    expect(annualTaxDueCents(BIR, -5n)).toBe(0n);
    expect(annualTaxDueCents(BIR, 24_999_600n)).toBe(0n); // ₱20,833 a month: nothing
    expect(marginalAnnualTaxCents(BIR, 26_000_000n, 1_767_704n)).toBe(yearTax(27_767_704n) - yearTax(26_000_000n));
    expect(marginalAnnualTaxCents(BIR, 26_000_000n, 0n)).toBe(0n);
  });

  it("Y1 (T1, PAY-154) the 13th month's taxable excess is taxed at the year's rate", () => {
    // QA-02: 13th month ₱22,677.04, ₱85,000 of the 90,000 already used, about
    // ₱260,000 of taxable pay so far this year.
    const r = computeSheet(input({
      runType: "YEAR_END",
      thirteenthMonthCents: 2_267_704n,
      benefitsExemptUsedCents: 8_500_000n,
      ytdTaxableCents: 26_000_000n,
    }));
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(500_000n);
    expect(r.grossTaxableIncomeCents).toBe(1_767_704n);
    // The old way: the MONTHLY table on ₱17,677.04 alone, below ₱20,833: zero.
    expect(lookupBIR(BIR, "MONTHLY", 1_767_704n).tax).toBe(0n);
    const expected = yearTax(26_000_000n + 1_767_704n) - yearTax(26_000_000n);
    expect(expected).toBeGreaterThan(0n);
    expect(r.withholdingTaxCents).toBe(expected);
    expect(r.netPayCents).toBe(2_267_704n - expected);
  });

  it("Y2 with no year-to-date figure, the excess is the year's only taxable pay", () => {
    const r = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: 9_000_001n }));
    expect(r.grossTaxableIncomeCents).toBe(1n);
    expect(r.withholdingTaxCents).toBe(yearTax(1n)); // zero
    const big = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: 40_000_000n }));
    expect(big.withholdingTaxCents).toBe(yearTax(31_000_000n)); // 400,000 - 90,000 exempt
  });

  const finalPay = (priorTaxable: bigint, priorWht: bigint) =>
    input({
      runType: "FINAL_PAY",
      employee: { ...input({}).employee, separationDate: d("2026-12-10") },
      salary: { basicSalaryCents: 3_000_000n, salaryType: "MONTHLY" },
      finalPayInputs: {
        proratedThirteenthMonthCents: 1_750_000n,
        leaveCashOutCents: 0n,
        separationPayCents: 0n,
        isSeparationPayTaxable: true,
        cyPriorTaxableIncomeCents: priorTaxable,
        cyPriorWithholdingTaxCents: priorWht,
      },
    });

  it("F1 (T1, PAY-156) final pay refunds tax withheld above the year's tax due", () => {
    // QA-01: ₱281,500 taxable this year, ₱10,975.00 withheld.
    const r = computeSheet(finalPay(28_150_000n, 1_097_500n));
    const due = yearTax(28_150_000n);
    expect(due).toBe(472_560n); // ₱4,725.60, as staging showed
    expect(r.withholdingTaxCents).toBe(due - 1_097_500n); // -₱6,249.40
    expect(r.withholdingTaxCents).toBe(-624_940n);
    expect(r.netPayCents).toBe(1_750_000n + 624_940n); // 13th month + refund
    expect(r.finalPayBreakdown?.annualizedWhtCents).toBe("472560");
  });

  it("F2 a shortfall is still withheld", () => {
    const r = computeSheet(finalPay(28_150_000n, 100_000n));
    expect(r.withholdingTaxCents).toBe(472_560n - 100_000n);
    expect(r.netPayCents).toBe(1_750_000n - 372_560n);
  });

  it("P1 the payslip calls a negative withholding a tax refund and still adds up", () => {
    const r = computeSheet(finalPay(28_150_000n, 1_097_500n));
    const src: PayslipPdfSource = {
      company: { name: "Sentire QA Co." },
      book: { periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "FINAL_PAY", finalizedAt: d("2026-12-14") },
      sheet: { ...r, id: "p156-sheet", statutoryBreakdown: r.statutoryBreakdown, loanPaymentsApplied: [], adjustmentsApplied: [], expenseClaimsApplied: [] },
      employee: { employeeNumber: "EMP-156", firstName: "Ana", lastName: "Santos", position: null, department: null, branch: null, statutoryIds: [] },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0,
        leaveBalances: [],
      },
    };
    const data = buildPayslipPdfData(src);
    const refund = data.statutory.find((l) => l.label === "Tax refund (year-end adjustment)");
    expect(refund?.amount).toBe(-624_940n);
    expect(data.statutory.some((l) => l.label === "Withholding tax")).toBe(false);
    const earnings = data.earnings.reduce((s, l) => s + l.amount, 0n);
    const statutory = data.statutory.reduce((s, l) => s + l.amount, 0n);
    expect(earnings).toBe(r.grossCompensationCents);
    expect(earnings - statutory).toBe(r.netPayCents); // no other deductions here
  });
});
