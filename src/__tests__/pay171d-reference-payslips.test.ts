/**
 * PAY-171 acceptance (Wave 2 end check): Mark's reference payslips (Smart
 * 2018 to 2022, Digitel 2019; Project doc of 17 Nov 2026) replayed through
 * the engine, tax to the centavo. TRAIN table of 2018 to 2022.
 *
 *   F1  Balino, 16 to 29 Feb 2020: taxable ₱15,158.02 gives ₱948.20.
 *   F2  Balino, 1 to 15 Feb 2020: ₱759.28 + ₱1,081.38 = ₱1,840.66 (regular
 *       by the table, sick leave conversion at the year's rate, 14th and
 *       15th month tax-free).
 *   F3  Digitel, 1 to 15 Mar 2019: ₱12,542.80 gives ₱425.16.
 *   F4  Digitel, 16 to 31 Mar 2019: STIP ₱31,383.00 tax-free, ₱57.53.
 *   F5  Canlubo, 1 to 15 May 2018: nothing withheld (cumulative average).
 *   F6  Canlubo, 2021: year's tax ₱24,090.23 (adjustment ₱1.60, C4 of
 *       pay171c-year-end-db).
 *   F7  Canlubo, 1 to 15 Jan 2022: ₱16,860.21 gives ₱1,298.30.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { annualTaxDueCents } from "@/lib/payroll/annual-tax";
import type { ComputeInput, ComputePayComponent } from "@/lib/payroll/types";
import type { BirWithholdingPayload } from "@/lib/statutory/types";
import { DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (floor: number, fixedTax: number, plusRate: number) => ({ floor, fixedTax, plusRate });
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

function period(halfCents: bigint, start: string, end: string, extra: Partial<ComputeInput> = {}): ComputeInput {
  return {
    employee: {
      id: "ref", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY",
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
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: TRAIN_2018, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: false,
    runType: "REGULAR",
    ...extra,
  };
}

describe("PAY-171 Mark's reference payslips, tax to the centavo", () => {
  it("F1 Balino 16 to 29 Feb 2020: ₱948.20", () => {
    expect(computeSheet(period(1_515_802n, "2020-02-16", "2020-02-29")).withholdingTaxCents).toBe(94_820n);
  });
  it("F2 Balino 1 to 15 Feb 2020: ₱1,840.66", () => {
    const r = computeSheet(period(1_421_341n, "2020-02-01", "2020-02-15", {
      ytdTaxableCents: 2_842_682n,
      payComponents: [
        comp("sl_conversion", 540_690n, { kind: "OTHER_EARNING", taxability: "TAXABLE", isOneOff: true }),
        comp("m14", 186_667n, { isBonus: true }),
        comp("m15", 186_667n, { isBonus: true }),
      ],
    }));
    expect(r.withholdingTaxCents).toBe(184_066n);
  });
  it("F3 Digitel 1 to 15 Mar 2019: ₱425.16", () => {
    expect(computeSheet(period(1_254_280n, "2019-03-01", "2019-03-15")).withholdingTaxCents).toBe(42_516n);
  });
  it("F4 Digitel 16 to 31 Mar 2019: STIP tax-free, ₱57.53", () => {
    const r = computeSheet(period(1_070_463n, "2019-03-16", "2019-03-31", { payComponents: [comp("stip", 3_138_300n, { isBonus: true })] }));
    expect(r.withholdingTaxCents).toBe(5_753n);
  });
  it("F5 Canlubo 1 to 15 May 2018: nothing withheld", () => {
    const r = computeSheet(period(905_500n, "2018-05-01", "2018-05-15", {
      payComponents: [comp("ot", 154_500n, { kind: "OTHER_EARNING", taxability: "TAXABLE" })],
      cumulativeAverage: { priorTaxableCents: 9_331_328n - 1_060_000n, priorWithheldCents: 0n, usedThisYear: false },
    }));
    expect(r.withholdingTaxCents).toBe(0n);
  });
  it("F6 Canlubo 2021: year's tax ₱24,090.23", () => {
    expect(annualTaxDueCents(TRAIN_2018, 37_045_114n)).toBe(2_409_023n);
  });
  it("F7 Canlubo 1 to 15 Jan 2022: ₱1,298.30", () => {
    expect(computeSheet(period(1_686_021n, "2022-01-01", "2022-01-15")).withholdingTaxCents).toBe(129_830n);
  });
});
