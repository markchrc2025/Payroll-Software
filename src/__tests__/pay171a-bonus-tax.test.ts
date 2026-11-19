/**
 * PAY-171 (Mark, 17 Nov 22:52 and 19 Nov 2026): bonuses are customizable
 * pay components with a Bonus tick box, paid on the regular payslip, and the
 * tax must be exact, as on Mark's Smart and Digitel payslips (Project doc
 * "Payroll_Tax_Method_from_Reference_Payslips_2026-11-17.md"). Figures use
 * the TRAIN table of 2018 to 2022, the years of those payslips.
 *
 *   X1  (T1) Smart, Balino, 1 to 15 Feb 2020 (finding 2): regular taxable
 *       ₱14,213.41 is taxed by the table (₱759.28); the sick leave conversion
 *       ₱5,406.90, one-off pay, at her rate for the year (20%, ₱1,081.38);
 *       14th and 15th month ₱1,866.67 each are bonuses, tax-free. Total
 *       ₱1,840.66, to the centavo.
 *   X2  Digitel, 16 to 31 Mar 2019 (finding 4): the STIP bonus ₱31,383.00 is
 *       tax-free (the year's ₱90,000 not yet used); regular ₱10,704.63 gives
 *       ₱57.53.
 *   X3  the ₱90,000 runs over the year: with ₱70,000 already used, ₱20,000
 *       of the same bonus is tax-free and the ₱11,383.00 excess is taxed at
 *       the employee's rate for the year, not through the period's table.
 *   X4  the Taxability of a bonus component is not used (a bonus marked
 *       TAXABLE is still within the ₱90,000).
 *   X5  without bonuses or one-off pay the tax is exactly as before.
 *   X6  the year's tax uses the annual table when the rule has one: Smart,
 *       Canlubo 2021 (finding 6): ₱370,451.14 gives ₱24,090.23.
 *   X7  final pay: bonuses share the year's ₱90,000 with the prorated 13th month.
 *   X8  periods left in the year (projection), per cycle.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { annualTaxDueCents, periodsElapsedBefore, periodsPerYear } from "@/lib/payroll/annual-tax";
import type { ComputeInput, ComputePayComponent } from "@/lib/payroll/types";
import type { BirWithholdingPayload } from "@/lib/statutory/types";
import { DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (floor: number, fixedTax: number, plusRate: number) => ({ floor, fixedTax, plusRate });
/** TRAIN, 1 Jan 2018 to 31 Dec 2022 (RR 11-2018, Annex E; annual table RA 10963). */
const TRAIN_2018 = {
  frequencies: {
    SEMI_MONTHLY: [row(0, 0, 0), row(1_041_700, 0, 0.2), row(1_666_700, 125_000, 0.25), row(3_333_300, 541_667, 0.3), row(8_333_300, 2_041_667, 0.32), row(33_333_300, 10_041_667, 0.35)],
    MONTHLY: [row(0, 0, 0), row(2_083_300, 0, 0.2), row(3_333_300, 250_000, 0.25), row(6_666_700, 1_083_333, 0.3), row(16_666_700, 4_083_333, 0.32), row(66_666_700, 20_083_333, 0.35)],
    ANNUAL: [row(0, 0, 0), row(25_000_000, 0, 0.2), row(40_000_000, 3_000_000, 0.25), row(80_000_000, 13_000_000, 0.3), row(200_000_000, 49_000_000, 0.32), row(800_000_000, 241_000_000, 0.35)],
  },
} as unknown as BirWithholdingPayload;

const comp = (id: string, amountCents: bigint, extra: Partial<ComputePayComponent> = {}): ComputePayComponent => ({
  id, code: id.toUpperCase(), name: id, kind: "BONUS", taxability: "NON_TAXABLE", amountCents, deMinimisCode: null, ...extra,
});

/** A monthly-paid employee whose semi-monthly basic equals `halfCents`, no contributions this period. */
function regular(halfCents: bigint, start: string, end: string, extra: Partial<ComputeInput> = {}): ComputeInput {
  return {
    employee: {
      id: "p171", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null,
      hireDate: d("2015-01-05"), separationDate: null,
    },
    salary: { basicSalaryCents: halfCents * 2n, salaryType: "MONTHLY" },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d(start), end: d(end), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 11, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0,
      regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0,
    },
    payComponents: [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: TRAIN_2018, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: false,
    runType: "REGULAR",
    ...extra,
  };
}

describe("PAY-171 bonuses and one-off pay: exact tax", () => {
  it("X1 (T1) Smart 1 to 15 Feb 2020: table on regular, year's rate on one-off, bonuses tax-free", () => {
    const r = computeSheet(regular(1_421_341n, "2020-02-01", "2020-02-15", {
      ytdTaxableCents: 2_842_682n, // January's two periods
      payComponents: [
        comp("sl_conversion", 540_690n, { kind: "OTHER_EARNING", taxability: "TAXABLE", isOneOff: true }),
        comp("m14", 186_667n, { isBonus: true }),
        comp("m15", 186_667n, { isBonus: true }),
      ],
    }));
    expect(r.withholdingTaxCents).toBe(184_066n); // ₱759.28 + ₱1,081.38
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(373_334n);
    expect(r.grossCompensationCents).toBe(1_421_341n + 540_690n + 373_334n);
    expect(r.statutoryBreakdown.benefits).toMatchObject({ excessTaxCents: "108138", oneOffCents: "540690" });
  });

  it("X2 Digitel 16 to 31 Mar 2019: the STIP bonus is tax-free; the table taxes regular pay", () => {
    const r = computeSheet(regular(1_070_463n, "2019-03-16", "2019-03-31", {
      payComponents: [comp("stip", 3_138_300n, { isBonus: true })],
    }));
    expect(r.withholdingTaxCents).toBe(5_753n);
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(3_138_300n);
  });

  it("X3 the ₱90,000 runs over the year; the excess is taxed at the year's rate", () => {
    const r = computeSheet(regular(1_070_463n, "2019-03-16", "2019-03-31", {
      benefitsExemptUsedCents: 7_000_000n,
      ytdTaxableCents: 5_000_000n,
      payComponents: [comp("stip", 3_138_300n, { isBonus: true })],
    }));
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(2_000_000n);
    const b = r.statutoryBreakdown.benefits!;
    expect(b.excessCents).toBe("1138300");
    // Projected year: ₱50,000 so far + ₱10,704.63 x 19 periods left = ₱253,388; the
    // excess crosses ₱250,000 inside the 20% bracket: (253,388 + 11,383 - 250,000) x 20%.
    const projected = 5_000_000n + 1_070_463n * 19n;
    expect(b.projectedAnnualTaxableCents).toBe(projected.toString());
    const expected = annualTaxDueCents(TRAIN_2018, projected + 1_138_300n) - annualTaxDueCents(TRAIN_2018, projected);
    expect(b.excessTaxCents).toBe(expected.toString());
    expect(r.withholdingTaxCents).toBe(5_753n + expected);
  });

  it("X4 a bonus's Taxability is not used", () => {
    const r = computeSheet(regular(1_070_463n, "2019-03-16", "2019-03-31", {
      payComponents: [comp("stip", 3_138_300n, { isBonus: true, taxability: "TAXABLE" })],
    }));
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(3_138_300n);
    expect(r.withholdingTaxCents).toBe(5_753n);
  });

  it("X5 without bonuses or one-off pay the tax is as before", () => {
    const r = computeSheet(regular(1_070_463n, "2019-03-16", "2019-03-31", {
      payComponents: [comp("allow", 100_000n, { kind: "ALLOWANCE", taxability: "TAXABLE" })],
    }));
    // ₱11,704.63 through the table: 20% of the excess over ₱10,417.
    expect(r.withholdingTaxCents).toBe(25_753n);
    expect(r.statutoryBreakdown.benefits).toBeUndefined();
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(0n);
  });

  it("X6 the year's tax uses the annual table when loaded: Canlubo 2021", () => {
    expect(annualTaxDueCents(TRAIN_2018, 37_045_114n)).toBe(2_409_023n);
  });

  it("X7 final pay: bonuses share the ₱90,000 with the prorated 13th month", () => {
    const input = regular(1_070_463n, "2026-06-01", "2026-06-15", {
      runType: "FINAL_PAY",
      benefitsExemptUsedCents: 0n,
      payComponents: [comp("m14", 2_000_000n, { isBonus: true })],
      finalPayInputs: {
        leaveCashOutCents: 0n,
        proratedThirteenthMonthCents: 8_000_000n,
        separationPayCents: 0n,
        isSeparationPayTaxable: false,
        cyPriorTaxableIncomeCents: 0n,
        cyPriorWithholdingTaxCents: 0n,
      },
    });
    const r = computeSheet(input);
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(9_000_000n);
    const m14 = r.payComponentsApplied.find((a) => a.id === "m14")!;
    expect([m14.nonTaxablePortionCents, m14.taxablePortionCents]).toEqual(["1000000", "1000000"]);
    // Final pay pays basic by days worked; the 13th month and the bonus are both in gross.
    expect(r.grossCompensationCents).toBe(r.basePayCents + 8_000_000n + 2_000_000n);
  });

  it("X8 periods in the year and periods already past", () => {
    expect(periodsPerYear("SEMI_MONTHLY")).toBe(24n);
    expect(periodsElapsedBefore("SEMI_MONTHLY", d("2020-02-01"))).toBe(2n);
    expect(periodsElapsedBefore("SEMI_MONTHLY", d("2019-03-16"))).toBe(5n);
    expect(periodsElapsedBefore("SEMI_MONTHLY", d("2021-12-16"))).toBe(23n);
    expect(periodsElapsedBefore("MONTHLY", d("2021-12-01"))).toBe(11n);
  });
});
