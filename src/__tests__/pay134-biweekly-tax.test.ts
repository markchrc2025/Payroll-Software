/**
 * PAY-134: the BIR withholding table has no BI_WEEKLY column, and a
 * bi-weekly run used to throw ("BIR withholding table missing for pay
 * frequency: BI_WEEKLY"). Mark's ruling, 17 Nov 2026: option A, annualize.
 * One bi-weekly period's tax = the year's tax on (taxable x 26), divided by
 * 26, rounded half up to the centavo. The year's tax is the method year-end
 * annualization and final pay use (annual-tax.ts). Figures use the TRAIN
 * table in force from 1 Jan 2023.
 *
 *   B1  (T1) a bi-weekly employee (weekly rate ₱15,000) computes, and the tax
 *       is the annualized one.
 *   B2  a worked figure: ₱20,000.00 taxable in a bi-weekly period withholds
 *       ₱1,788.49 (year ₱520,000.00, monthly equivalent ₱43,333.33, MONTHLY
 *       bracket ₱1,875 + 20% of the excess over ₱33,333, times 12, / 26).
 *   B3  below the yearly ₱250,000 exemption no tax is withheld
 *       (₱9,600.00 x 26 = ₱249,600.00).
 *   B4  cycles that have a column keep using it unchanged.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { annualTaxDueCents, periodWithholdingTax } from "@/lib/payroll/annual-tax";
import { lookupBIR } from "@/lib/statutory/compute";
import type { ComputeInput } from "@/lib/payroll/types";
import type { BirWithholdingPayload } from "@/lib/statutory/types";
import { DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (floor: number, fixedTax: number, plusRate: number) => ({ floor, fixedTax, plusRate });
/** The TRAIN table in force from 1 Jan 2023 (as published in Sentire). */
const TRAIN = {
  frequencies: {
    DAILY: [row(0, 0, 0), row(68_500, 0, 0.15), row(109_600, 6_165, 0.2), row(219_200, 28_085, 0.25), row(547_900, 110_260, 0.3), row(2_191_800, 603_430, 0.35)],
    WEEKLY: [row(0, 0, 0), row(480_800, 0, 0.15), row(769_300, 43_270, 0.2), row(1_538_500, 197_120, 0.25), row(3_846_200, 774_050, 0.3), row(15_384_700, 4_235_600, 0.35)],
    SEMI_MONTHLY: [row(0, 0, 0), row(1_041_700, 0, 0.15), row(1_666_700, 93_750, 0.2), row(3_333_300, 427_080, 0.25), row(8_333_300, 1_677_080, 0.3), row(33_333_300, 9_177_080, 0.35)],
    MONTHLY: [row(0, 0, 0), row(2_083_300, 0, 0.15), row(3_333_300, 187_500, 0.2), row(6_666_700, 854_170, 0.25), row(16_666_700, 3_354_170, 0.3), row(66_666_700, 18_354_170, 0.35)],
  },
} as unknown as BirWithholdingPayload;

function biWeekly(): ComputeInput {
  return {
    employee: {
      id: "p134-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: "BI_WEEKLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d("2025-01-06"),
      separationDate: null,
    },
    salary: { basicSalaryCents: 1_500_000n, salaryType: "WEEKLY" },
    tenant: {
      workingDaysDenominator: 261,
      statutoryCutoffRule: "FIRST_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
      allowNegativeFinalPay: true,
    },
    period: { start: d("2026-11-02"), end: d("2026-11-15"), cycle: "BI_WEEKLY" },
    periodInput: {
      daysWorked: 10,
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
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: TRAIN, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: true,
    runType: "REGULAR",
  };
}

describe("PAY-134 bi-weekly withholding tax is annualized", () => {
  it("B1 (T1) a bi-weekly employee computes, with the annualized tax", () => {
    const r = computeSheet(biWeekly());
    const taxable = r.grossTaxableIncomeCents;
    expect(taxable).toBeGreaterThan(0n);
    expect(r.withholdingTaxCents).toBe((annualTaxDueCents(TRAIN, taxable * 26n) + 13n) / 26n);
    expect(r.withholdingTaxCents).toBeGreaterThan(0n);
    expect(r.statutoryBreakdown.bir).not.toBeNull();
  });

  it("B2 ₱20,000.00 taxable in a bi-weekly period withholds ₱1,788.49", () => {
    expect(periodWithholdingTax(TRAIN, "BI_WEEKLY", 2_000_000n).tax).toBe(178_849n);
  });

  it("B3 below the yearly exemption nothing is withheld", () => {
    expect(periodWithholdingTax(TRAIN, "BI_WEEKLY", 960_000n).tax).toBe(0n);
  });

  it("B4 cycles with their own column are unchanged", () => {
    for (const cycle of ["DAILY", "WEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const) {
      for (const taxable of [50_000n, 1_200_000n, 2_500_000n, 9_000_000n]) {
        expect(periodWithholdingTax(TRAIN, cycle, taxable).tax).toBe(lookupBIR(TRAIN, cycle, taxable).tax);
      }
    }
  });
});
