/**
 * PAY-153 (found while building PAY-144, 16 Nov 2026): final pay must PAY the
 * prorated 13th month. Before this fix the engine computed it and stored its
 * exempt part, but left it out of gross and net pay, and subtracted the exempt
 * part from taxable pay as if it had been in gross.
 *
 * Example: monthly ₱30,000, last cutoff 1 to 15 Dec with 10 days worked,
 * prorated 13th month ₱20,000.
 *
 *   F1  (T1) net pay includes the ₱20,000; gross = base pay + 13th month.
 *   F2  taxable pay is the base pay only (the 13th month is within the
 *       90,000); the exempt part is not taken off the base pay.
 *   F3  above the 90,000 (PAY-144: ₱85,000 already used): only ₱5,000 is
 *       exempt, ₱15,000 is taxable, and the net still includes all ₱20,000
 *       before tax.
 *   F4  a final pay of only the 13th month carries no SSS, PhilHealth or
 *       Pag-IBIG: the 13th month is not contributory pay.
 *   F5  the payslip shows a "13th month pay" line and its earnings column
 *       still adds up to gross.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { multiply } from "@/lib/money";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";
import { buildPayslipPdfData, type PayslipPdfSource } from "@/lib/payslip/pdf-data";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function finalPay(o: { days: number; p13th: bigint; used?: bigint; statutory?: boolean }): ComputeInput {
  return {
    runType: "FINAL_PAY",
    employee: {
      id: "p153-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d("2025-01-06"),
      separationDate: d("2026-12-10"),
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
      daysWorked: o.days,
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
    ...(o.statutory === undefined ? { overrideStatutoryDeducted: false } : {}),
    benefitsExemptUsedCents: o.used,
    finalPayInputs: {
      proratedThirteenthMonthCents: o.p13th,
      leaveCashOutCents: 0n,
      separationPayCents: 0n,
      isSeparationPayTaxable: true,
      cyPriorTaxableIncomeCents: 0n,
      cyPriorWithholdingTaxCents: 0n,
    },
  };
}

// 10 days at ₱30,000 x 12 / 261 a day, HALF-UP: 1,379,310 centavos.
const BASE = multiply(3_000_000n * 12n, 10 / 261);

describe("PAY-153 final pay pays the prorated 13th month", () => {
  it("F1 (T1) net pay includes it", () => {
    const r = computeSheet(finalPay({ days: 10, p13th: 2_000_000n }));
    expect(r.basePayCents).toBe(BASE);
    expect(r.grossCompensationCents).toBe(BASE + 2_000_000n);
    expect(r.netPayCents).toBe(BASE + 2_000_000n - r.withholdingTaxCents);
  });

  it("F2 taxable pay is the base pay only", () => {
    const r = computeSheet(finalPay({ days: 10, p13th: 2_000_000n }));
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(2_000_000n);
    expect(r.grossTaxableIncomeCents).toBe(BASE);
  });

  it("F3 above the 90,000, the excess is taxable and still paid", () => {
    const r = computeSheet(finalPay({ days: 10, p13th: 2_000_000n, used: 8_500_000n }));
    expect(r.nontaxable13MonthAndBenefitsCents).toBe(500_000n);
    expect(r.grossTaxableIncomeCents).toBe(BASE + 1_500_000n);
    expect(r.grossCompensationCents).toBe(BASE + 2_000_000n);
    expect(r.netPayCents).toBe(BASE + 2_000_000n - r.withholdingTaxCents);
  });

  it("F4 a final pay of only the 13th month has no contributions", () => {
    // statutory left to the cutoff rule (FIRST_CUTOFF, a 1 to 15 run deducts).
    const r = computeSheet(finalPay({ days: 0, p13th: 2_000_000n, statutory: true }));
    expect(r.sssEeCents + r.philhealthEeCents + r.pagibigEeCents).toBe(0n);
    expect(r.statutoryDeductedSnapshot).toBe(false);
    expect(r.netPayCents).toBe(2_000_000n);
  });

  it("F5 the payslip shows the 13th month and adds up", () => {
    const r = computeSheet(finalPay({ days: 10, p13th: 2_000_000n, used: 8_500_000n }));
    const src: PayslipPdfSource = {
      company: { name: "Sentire QA Co." },
      book: { periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "FINAL_PAY", finalizedAt: d("2026-12-14") },
      sheet: {
        ...r,
        id: "p153-sheet",
        statutoryBreakdown: r.statutoryBreakdown,
        loanPaymentsApplied: [],
        adjustmentsApplied: [],
        expenseClaimsApplied: [],
      },
      employee: {
        employeeNumber: "EMP-153", firstName: "Ana", lastName: "Santos",
        position: null, department: null, branch: null, statutoryIds: [],
      },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0,
        leaveBalances: [],
      },
    };
    const data = buildPayslipPdfData(src);
    const labels = data.earnings.map((l) => l.label);
    expect(labels).toContain("13th month pay (non-taxable)");
    const sum = data.earnings.reduce((s, l) => s + l.amount, 0n);
    expect(sum).toBe(r.grossCompensationCents);
  });
});
