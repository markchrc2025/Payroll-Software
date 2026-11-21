/**
 * Mark's ruling (21 Nov 2026 22:25, confirmed 22:40: a company setting,
 * default the method of his reference payslip): final pay returns the tax
 * withheld earlier in the year and withholds on the final pay by itself
 * (MONTHLY table). Decision 8: up to 10 days of vacation leave converted to
 * cash in the year are de minimis.
 *
 * ₱30,000.00 a month (₱1,379.31 a day), last cutoff 16 to 30 Nov 2026, 11 days
 * worked: back pay 15,172.41. 15 days of vacation leave converted: 20,689.65,
 * of which 10 days (13,793.10) de minimis. Year so far: taxable 300,000.00,
 * withheld 7,891.51.
 *
 *   T1  REFUND_AND_WITHHOLD_FINAL: taxable 15,172.41 + 6,896.55 = 22,068.96;
 *       tax (TRAIN 2023 monthly: 15% over 20,833.00) 185.39; the 7,891.51 is
 *       returned: net withholding -7,706.12 (fails on main).
 *   T2  ANNUALIZE keeps PAY-156: the year's tax less 7,891.51.
 *   T3  MWE (₱645.00 a day, NCR): no tax on the final pay, the earlier tax is
 *       still returned.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { annualTaxDueCents } from "@/lib/payroll/annual-tax";
import type { ComputeInput } from "@/lib/payroll/types";
import { DE_MINIMIS_2025, MIN_WAGE_2025, PAGIBIG_2024, PHIC_2025, SSS_2026, TRAIN_2023 } from "@/lib/statutory/baseline-2026";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
function input(method: "REFUND_AND_WITHHOLD_FINAL" | "ANNUALIZE", tax: "REGULAR" | "MWE" = "REGULAR"): ComputeInput {
  return {
    employee: { id: "e", taxClassification: tax, region: "NCR", payFrequency: "SEMI_MONTHLY", standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null, hireDate: d("2020-01-06"), separationDate: d("2026-11-30") },
    salary: { basicSalaryCents: 3_000_000n, salaryType: "MONTHLY" },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true, finalPayTaxMethod: method },
    period: { start: d("2026-11-16"), end: d("2026-11-30"), cycle: "SEMI_MONTHLY" },
    periodInput: { daysWorked: 11, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0, regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0 },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS_2026, philHealth: PHIC_2025, pagibig: PAGIBIG_2024, bir: TRAIN_2023, minWage: MIN_WAGE_2025, deMinimis: DE_MINIMIS_2025 },
    runType: "FINAL_PAY",
    overrideStatutoryDeducted: false,
    finalPayInputs: {
      proratedThirteenthMonthCents: 0n, leaveCashOutCents: 2_068_965n, leaveCashOutDeMinimisCents: 1_379_310n,
      separationPayCents: 0n, isSeparationPayTaxable: false,
      cyPriorTaxableIncomeCents: 30_000_000n, cyPriorWithholdingTaxCents: 789_151n,
    },
  };
}

describe("Final pay tax method and vacation leave de minimis", () => {
  it("T1 refund the year's tax, tax the final pay by itself", () => {
    const r = computeSheet(input("REFUND_AND_WITHHOLD_FINAL"));
    expect(r.basePayCents).toBe(1_517_241n);
    expect(r.grossTaxableIncomeCents).toBe(2_206_896n);
    expect(r.withholdingTaxCents).toBe(18_539n - 789_151n);
    expect(r.finalPayBreakdown).toMatchObject({ taxMethod: "REFUND_AND_WITHHOLD_FINAL", finalPayTaxCents: "18539", refundedPriorTaxCents: "789151", leaveCashOutDeMinimisCents: "1379310" });
  });
  it("T2 annualization is unchanged", () => {
    const r = computeSheet(input("ANNUALIZE"));
    expect(r.withholdingTaxCents).toBe(annualTaxDueCents(TRAIN_2023, 30_000_000n + 2_206_896n) - 789_151n);
  });
  it("T3 MWE: the earlier tax is returned, none withheld", () => {
    const r = computeSheet({ ...input("REFUND_AND_WITHHOLD_FINAL", "MWE"), salary: { basicSalaryCents: 64_500n, salaryType: "DAILY" } });
    expect(r.withholdingTaxCents).toBe(-789_151n);
  });
});
