/**
 * PAY-144 (Mark, 16 Nov 2026, HR.my review D4 = C): year-to-date openings,
 * the pure parts. The real-database suite is pay144-ytd-openings-db.test.ts.
 *
 *   O1  totals: basic pay earned and 13th month paid come from this company's
 *       own pay before Sentire only; taxable pay, tax withheld and the 90,000
 *       already used come from both sources.
 *   O2  peso amounts typed by a person: commas and the peso sign allowed, at
 *       most two decimals, never negative, empty is zero.
 *   O3  a CSV row becomes an opening, or says exactly what is wrong.
 *   O4  the API body takes whole centavos only.
 *   E1  YEAR_END exempts only what is left of the 90,000; with nothing used
 *       it is unchanged (the invariant).
 *   E2  FINAL_PAY's prorated 13th month does the same.
 *   R1  the 2316 adds pay before Sentire to this employer's boxes without
 *       counting it as a pay period, lists an employee paid only before
 *       Sentire, and shows a previous employer's taxable pay and tax.
 *   R2  the alphalist adds pay before Sentire to the totals.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import {
  csvRowToInput,
  openingAsReportSheet,
  parsePesoAmount,
  ytdOpeningInput,
  ytdOpeningTotals,
  type YtdOpening,
} from "@/lib/payroll/ytd-openings";
import { buildBir2316Report } from "@/lib/payroll/reports/bir-2316";
import { buildAlphalistReport } from "@/lib/payroll/reports/bir-alphalist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function opening(o: Partial<YtdOpening> & { source: YtdOpening["source"] }): YtdOpening {
  return {
    previousEmployerName: o.source === "PREVIOUS_EMPLOYER" ? "Acme Corp." : null,
    previousEmployerTin: null,
    basicPayEarnedCents: 0n,
    thirteenthMonthPaidCents: 0n,
    taxableCompensationCents: 0n,
    withholdingTaxCents: 0n,
    nontaxable13MonthAndBenefitsCents: 0n,
    sssEeCents: 0n,
    philhealthEeCents: 0n,
    pagibigEeCents: 0n,
    otherNontaxableCents: 0n,
    ...o,
  };
}

describe("PAY-144 O1 to O4: openings", () => {
  it("O1 totals by source", () => {
    const t = ytdOpeningTotals([
      opening({
        source: "PRIOR_PAYROLL",
        basicPayEarnedCents: 25_000_000n, // ₱250,000
        thirteenthMonthPaidCents: 1_000_000n, // ₱10,000 paid in June
        taxableCompensationCents: 22_000_000n,
        withholdingTaxCents: 1_500_000n,
        nontaxable13MonthAndBenefitsCents: 1_000_000n,
      }),
      opening({
        source: "PREVIOUS_EMPLOYER",
        // A previous employer's basic pay can never reach this table through
        // the API (the database refuses it); if it did, it must not count.
        basicPayEarnedCents: 9_999_999n,
        thirteenthMonthPaidCents: 9_999_999n,
        taxableCompensationCents: 5_000_000n,
        withholdingTaxCents: 400_000n,
        nontaxable13MonthAndBenefitsCents: 500_000n,
      }),
    ]);
    expect(t).toEqual({
      basicPayEarnedCents: 25_000_000n,
      thirteenthMonthPaidCents: 1_000_000n,
      taxableCompensationCents: 27_000_000n, // 220,000 + 50,000
      withholdingTaxCents: 1_900_000n, // 15,000 + 4,000
      benefitsExemptUsedCents: 1_500_000n, // 10,000 + 5,000
    });
    expect(ytdOpeningTotals([])).toEqual({
      basicPayEarnedCents: 0n,
      thirteenthMonthPaidCents: 0n,
      taxableCompensationCents: 0n,
      withholdingTaxCents: 0n,
      benefitsExemptUsedCents: 0n,
    });
  });

  it("O2 peso amounts", () => {
    expect(parsePesoAmount("12,345.67")).toBe(1_234_567n);
    expect(parsePesoAmount("₱500")).toBe(50_000n);
    expect(parsePesoAmount("0.5")).toBe(50n);
    expect(parsePesoAmount(" 1000.05 ")).toBe(100_005n);
    expect(parsePesoAmount("")).toBe(0n);
    expect(parsePesoAmount(undefined)).toBe(0n);
    for (const bad of ["-1", "1.234", "abc", "1.2.3", "12e3"]) {
      expect(() => parsePesoAmount(bad), bad).toThrow(RangeError);
    }
  });

  it("O3 CSV rows", () => {
    const prior = csvRowToInput(
      {
        employee_number: "E-1",
        year: "2026",
        source: "prior payroll",
        basic_pay_earned: "250,000.00",
        thirteenth_month_paid: "10000",
        taxable_compensation: "220000",
        tax_withheld: "15,000.50",
        nontaxable_13th_month_and_benefits: "10000",
        sss_ee: "9,000",
        philhealth_ee: "6250",
        pagibig_ee: "2000",
        other_nontaxable: "1200",
      },
      "emp-1",
    );
    expect(prior.ok).toBe(true);
    if (prior.ok) {
      expect(prior.input).toMatchObject({
        source: "PRIOR_PAYROLL",
        employeeId: "emp-1",
        year: 2026,
        basicPayEarnedCents: 25_000_000n,
        thirteenthMonthPaidCents: 1_000_000n,
        taxableCompensationCents: 22_000_000n,
        withholdingTaxCents: 1_500_050n,
        nontaxable13MonthAndBenefitsCents: 1_000_000n,
        sssEeCents: 900_000n,
        philhealthEeCents: 625_000n,
        pagibigEeCents: 200_000n,
        otherNontaxableCents: 120_000n,
      });
    }

    const prev = csvRowToInput(
      { employee_number: "E-2", year: "2026", source: "PREVIOUS_EMPLOYER", previous_employer_name: "Acme Corp.", taxable_compensation: "50000", tax_withheld: "4000" },
      "emp-2",
    );
    expect(prev.ok && prev.input).toMatchObject({ source: "PREVIOUS_EMPLOYER", previousEmployerName: "Acme Corp.", taxableCompensationCents: 5_000_000n, withholdingTaxCents: 400_000n });

    const noName = csvRowToInput({ employee_number: "E-2", year: "2026", source: "PREVIOUS_EMPLOYER", taxable_compensation: "1" }, "emp-2");
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.errors.join(" ")).toMatch(/Previous employer name is required/);

    const prevBasic = csvRowToInput(
      { employee_number: "E-2", year: "2026", source: "PREVIOUS_EMPLOYER", previous_employer_name: "Acme", basic_pay_earned: "100" },
      "emp-2",
    );
    expect(prevBasic.ok).toBe(false);
    if (!prevBasic.ok) expect(prevBasic.errors.join(" ")).toMatch(/basic_pay_earned: leave blank for a previous employer/);

    const badSource = csvRowToInput({ employee_number: "E-1", year: "2026", source: "BOTH" }, "emp-1");
    expect(badSource.ok).toBe(false);
    if (!badSource.ok) expect(badSource.errors.join(" ")).toMatch(/source: must be PRIOR_PAYROLL or PREVIOUS_EMPLOYER/);

    const badAmount = csvRowToInput({ employee_number: "E-1", year: "2026", source: "PRIOR_PAYROLL", tax_withheld: "-50" }, "emp-1");
    expect(badAmount.ok).toBe(false);
    if (!badAmount.ok) expect(badAmount.errors.join(" ")).toMatch(/tax_withheld/);

    const badYear = csvRowToInput({ employee_number: "E-1", year: "1999", source: "PRIOR_PAYROLL" }, "emp-1");
    expect(badYear.ok).toBe(false);
  });

  it("O4 the API body takes whole centavos only", () => {
    const base = { employeeId: "e", year: 2026, source: "PRIOR_PAYROLL" };
    expect(ytdOpeningInput.safeParse({ ...base, basicPayEarnedCents: "2500000" }).success).toBe(true);
    expect(ytdOpeningInput.safeParse({ ...base, basicPayEarnedCents: "25000.00" }).success).toBe(false);
    expect(ytdOpeningInput.safeParse({ ...base, basicPayEarnedCents: "-1" }).success).toBe(false);
    const noName = ytdOpeningInput.safeParse({ ...base, source: "PREVIOUS_EMPLOYER" });
    expect(noName.success).toBe(false);
    expect(noName.error?.issues[0]?.message).toBe("Previous employer name is required"); // staging showed zod's default wording
    const parsed = ytdOpeningInput.parse({ ...base });
    expect(parsed).toMatchObject({ basicPayEarnedCents: 0n, taxableCompensationCents: 0n });
  });
});

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function input(extra: Partial<ComputeInput>): ComputeInput {
  return {
    employee: {
      id: "p144-emp",
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
    salary: { basicSalaryCents: 3_000_000n, salaryType: "MONTHLY" },
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
    ...extra,
  };
}

describe("PAY-144 E1, E2: the 90,000 exemption", () => {
  it("E1 YEAR_END exempts only what is left", () => {
    const thirteenth = 3_000_000n; // ₱30,000
    const none = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: thirteenth }));
    expect(none.nontaxable13MonthAndBenefitsCents).toBe(3_000_000n); // invariant: all of it
    expect(none.grossTaxableIncomeCents).toBe(0n);

    // ₱80,000 already used before Sentire: ₱10,000 left.
    const used = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: thirteenth, benefitsExemptUsedCents: 8_000_000n }));
    expect(used.nontaxable13MonthAndBenefitsCents).toBe(1_000_000n); // 90,000 - 80,000
    expect(used.grossTaxableIncomeCents).toBe(2_000_000n); // 30,000 - 10,000
    expect(used.grossCompensationCents).toBe(3_000_000n);

    // More than 90,000 already used: nothing is exempt.
    const over = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: thirteenth, benefitsExemptUsedCents: 9_500_000n }));
    expect(over.nontaxable13MonthAndBenefitsCents).toBe(0n);
    expect(over.grossTaxableIncomeCents).toBe(3_000_000n);
  });

  it("E2 FINAL_PAY prorated 13th month does the same", () => {
    const fp = {
      proratedThirteenthMonthCents: 2_000_000n, // ₱20,000
      leaveCashOutCents: 0n,
      separationPayCents: 0n,
      isSeparationPayTaxable: true,
      cyPriorTaxableIncomeCents: 0n,
      cyPriorWithholdingTaxCents: 0n,
    };
    const base = { runType: "FINAL_PAY" as const, finalPayInputs: fp, overrideStatutoryDeducted: false };
    const none = computeSheet(input(base));
    expect(none.nontaxable13MonthAndBenefitsCents).toBe(2_000_000n);
    const used = computeSheet(input({ ...base, benefitsExemptUsedCents: 8_500_000n }));
    expect(used.nontaxable13MonthAndBenefitsCents).toBe(500_000n); // 90,000 - 85,000
    // The ₱15,000 that is no longer exempt is the taxable excess now.
    expect(none.taxableAllowancesCents).toBe(0n);
    expect(used.taxableAllowancesCents).toBe(1_500_000n);
  });
});

// ---------------------------------------------------------------------------
// 2316 and alphalist
// ---------------------------------------------------------------------------

const sheet = (taxable: bigint, wht: bigint) => ({
  grossCompensationCents: taxable + 100_000n,
  mweExemptCompensationCents: 0n,
  nontaxableBasicCents: 0n,
  nontaxableCompensationCents: 100_000n, // ₱1,000 of contributions
  nontaxable13MonthAndBenefitsCents: 0n,
  grossTaxableIncomeCents: taxable,
  sssEeCents: 50_000n,
  philhealthEeCents: 30_000n,
  pagibigEeCents: 20_000n,
  withholdingTaxCents: wht,
});

const prior = opening({
  source: "PRIOR_PAYROLL",
  taxableCompensationCents: 20_000_000n, // ₱200,000
  withholdingTaxCents: 1_200_000n,
  nontaxable13MonthAndBenefitsCents: 1_000_000n,
  sssEeCents: 900_000n,
  philhealthEeCents: 500_000n,
  pagibigEeCents: 200_000n,
  otherNontaxableCents: 300_000n,
});

describe("PAY-144 R1, R2: 2316 and alphalist", () => {
  it("R1 the 2316", () => {
    const report = buildBir2316Report({
      year: 2026,
      tenantId: "t",
      tenantName: "T",
      employees: [
        {
          employeeId: "a", employeeNumber: "A", firstName: "Ana", middleName: null, lastName: "Alpha", suffix: null,
          taxClassification: "REGULAR",
          sheets: [sheet(2_500_000n, 100_000n), sheet(2_500_000n, 100_000n)],
          priorPayrollOpening: openingAsReportSheet(prior),
          previousEmployer: { name: "Acme Corp.", tin: "123-456-789-000", taxableCompensationCents: 5_000_000n, withholdingTaxCents: 400_000n },
        },
        {
          // Paid only before Sentire this year (left in March).
          employeeId: "b", employeeNumber: "B", firstName: "Ben", middleName: null, lastName: "Beta", suffix: null,
          taxClassification: "REGULAR",
          sheets: [],
          priorPayrollOpening: openingAsReportSheet(opening({ source: "PRIOR_PAYROLL", taxableCompensationCents: 6_000_000n, withholdingTaxCents: 300_000n })),
        },
        {
          employeeId: "c", employeeNumber: "C", firstName: "Cy", middleName: null, lastName: "Gamma", suffix: null,
          taxClassification: "REGULAR",
          sheets: [],
        },
      ],
    });
    expect(report.certificates.map((c) => c.employeeNumber)).toEqual(["A", "B"]); // C has nothing
    const a = report.certificates[0];
    expect(a.payPeriodCount).toBe(2); // the opening is not a pay period
    expect(a.includesPriorPayrollOpening).toBe(true);
    // 25,000 + 25,000 + 200,000
    expect(a.totalGrossTaxableIncomeCents).toBe("25000000");
    // Gross: two sheets (26,000 each) + opening (200,000 + 10,000 + 9,000 + 5,000 + 2,000 + 3,000)
    expect(a.totalGrossCompensationCents).toBe((2_600_000n * 2n + 22_900_000n).toString());
    expect(a.totalWithholdingTaxCents).toBe("1400000"); // 1,000 + 1,000 + 12,000
    expect(a.totalNontaxable13MonthAndBenefitsCents).toBe("1000000");
    expect(a.totalSssEeCents).toBe("1000000"); // 500 + 500 + 9,000
    expect(a.totalMandatoryEeCents).toBe((200_000n + 1_600_000n).toString());
    expect(a.totalOtherNontaxableCents).toBe("300000"); // contributions taken back out
    expect(a.previousEmployer).toEqual({ name: "Acme Corp.", tin: "123-456-789-000", taxableCompensationCents: "5000000", withholdingTaxCents: "400000" });
    expect(a.totalGrossTaxableAllEmployersCents).toBe("30000000"); // 250,000 + 50,000
    expect(a.totalWithholdingAllEmployersCents).toBe("1800000"); // 14,000 + 4,000
    const b = report.certificates[1];
    expect(b.payPeriodCount).toBe(0);
    expect(b.totalGrossTaxableIncomeCents).toBe("6000000");
    expect(b.previousEmployer).toBeNull();
    expect(b.totalWithholdingAllEmployersCents).toBe("300000");
  });

  it("R2 the alphalist", () => {
    const report = buildAlphalistReport({
      year: 2026,
      tenantId: "t",
      tenantName: "T",
      employees: [
        {
          employeeId: "a", employeeNumber: "A", firstName: "Ana", middleName: null, lastName: "Alpha", suffix: null,
          taxClassification: "REGULAR",
          sheets: [{ ...sheet(2_500_000n, 100_000n), isMwe: false }],
          priorPayrollOpening: { ...openingAsReportSheet(prior), isMwe: false },
        },
      ],
    });
    const row = report.entries[0];
    expect(row.payPeriodCount).toBe(1);
    expect(row.totalGrossTaxableIncomeCents).toBe("22500000"); // 25,000 + 200,000
    expect(row.totalWithholdingTaxCents).toBe("1300000"); // 1,000 + 12,000
    expect(row.totalOtherNontaxableCents).toBe("300000");
    expect(report.entries).toHaveLength(1);
  });
});
