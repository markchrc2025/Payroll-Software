/**
 * PAY-157 (Mark, 16 Nov 2026 23:22): a FINAL PAY payslip, so a separated
 * employee has a copy of their last pay showing every final pay item.
 *
 * Case: last cutoff 1 to 15 Dec 2026, 10 days at 30,000.00 a month; prorated
 * 13th month 20,000.00; 3 days of leave converted to cash 4,137.93; separation
 * pay (redundancy) 30,000.00 not taxable; a company loan of 3,000.00 settled
 * (installment 5,000.00 capped at the balance); the year's tax settled by the
 * final pay (281,500.00 taxable earlier, 10,975.00 withheld).
 *
 *   FP1 (T1) the payslip is titled a final pay and has a FINAL PAY summary:
 *       last working day, reason, prorated 13th month (with its non-taxable
 *       part), separation pay and whether it is taxed, and the year's tax:
 *       taxable and withheld earlier, due for the year, refunded or withheld now.
 *   FP2 every final pay item is its own line: salary for the last cutoff, the
 *       prorated 13th month, leave converted to cash, separation pay (not
 *       taxable, after tax); the loan says it is settled.
 *   FP3 the earnings add up to gross and the net box to net pay.
 *   FP4 the PDF renders, with a FinalPay_ file name.
 *   FP5 a taxable separation pay is an earnings line instead.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";
import { buildPayslipPdfData, type PayslipPdfSource } from "@/lib/payslip/pdf-data";
import { payslipFileName, renderPayslipPdf } from "@/lib/payslip/pdf-document";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function finalPay(o: { days: number; p13th: bigint; used?: bigint; statutory?: boolean; leave?: bigint; sep?: bigint; sepTaxable?: boolean; loanBalance?: bigint }): ComputeInput {
  return {
    runType: "FINAL_PAY",
    employee: {
      id: "p157-emp",
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
    loans: o.loanBalance ? [{ id: "loan-1", loanType: "COMPANY", installmentCents: 500_000n, balanceCents: o.loanBalance }] : [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    ...(o.statutory === undefined ? { overrideStatutoryDeducted: false } : {}),
    benefitsExemptUsedCents: o.used,
    finalPayInputs: {
      proratedThirteenthMonthCents: o.p13th,
      leaveCashOutCents: o.leave ?? 0n,
      separationPayCents: o.sep ?? 0n,
      isSeparationPayTaxable: o.sepTaxable ?? true,
      cyPriorTaxableIncomeCents: 28_150_000n,
      cyPriorWithholdingTaxCents: 1_097_500n,
    },
  };
}


const source = (r: ReturnType<typeof computeSheet>): PayslipPdfSource => ({
  company: { name: "Sentire QA Co." },
  book: { periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "FINAL_PAY", finalizedAt: d("2026-12-14"), separationReason: "REDUNDANCY" },
  sheet: {
    ...r, id: "p157-sheet", statutoryBreakdown: r.statutoryBreakdown, loanPaymentsApplied: r.loanPaymentsApplied,
    adjustmentsApplied: [], expenseClaimsApplied: [], finalPayBreakdown: r.finalPayBreakdown,
  },
  employee: {
    employeeNumber: "EMP-157", firstName: "Ana", lastName: "Santos", position: "Clerk", department: null, branch: null,
    statutoryIds: [], lastWorkingDate: d("2026-12-10"),
  },
  extras: {
    ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
    tardinessMinutes: 0,
    leaveBalances: [],
  },
});

const CASE = { days: 10, p13th: 2_000_000n, leave: 413_793n, sep: 3_000_000n, sepTaxable: false, loanBalance: 300_000n };

describe("PAY-157 final pay payslip", () => {
  it("FP1 (T1) it is titled a final pay and has the FINAL PAY summary", () => {
    const r = computeSheet(finalPay(CASE));
    const data = buildPayslipPdfData(source(r));
    expect(data.finalPay?.rows).toEqual([
      { label: "Last working day", value: "10 Dec 2026" },
      { label: "Reason", value: "Redundancy" },
      { label: "Prorated 13th month", value: "₱20,000.00 (₱20,000.00 not taxable)" },
      { label: "Separation pay", value: "₱30,000.00 (not taxable)" },
      { label: "Taxable pay earlier this year", value: "₱281,500.00" },
      { label: "Tax withheld earlier this year", value: "₱10,975.00" },
      { label: "Tax due for the year", value: expect.stringMatching(/^₱/) },
      { label: r.withholdingTaxCents < 0n ? "Tax refunded in this pay" : "Tax withheld in this pay", value: expect.stringMatching(/^₱/) },
    ]);
  });

  it("FP2 every final pay item is its own line; the loan is settled", () => {
    const r = computeSheet(finalPay(CASE));
    const data = buildPayslipPdfData(source(r));
    expect(data.earnings.map((l) => l.label)).toEqual([
      "Salary for the last cutoff", "Prorated 13th month pay", "Leave converted to cash",
    ]);
    expect(data.earnings.map((l) => l.amount)).toEqual([r.basePayCents, 2_000_000n, 413_793n]);
    expect(data.additions).toEqual([{ label: "Separation pay (not taxable)", amount: 3_000_000n }]);
    expect(data.other).toEqual([{ label: "Company loan (settled)", rate: "Balance ₱0.00", amount: 300_000n }]);
  });

  it("FP3 the earnings add up to gross, and the net box to net pay", () => {
    const r = computeSheet(finalPay(CASE));
    const data = buildPayslipPdfData(source(r));
    expect(data.earnings.reduce((t, l) => t + l.amount, 0n)).toBe(r.grossCompensationCents);
    expect(data.net.rows.map((x) => x.label)).not.toContain("Other items");
    expect(data.net.netPay).toBe(r.netPayCents);
  });

  it("FP4 the PDF renders, with a FinalPay_ file name", async () => {
    const data = buildPayslipPdfData(source(computeSheet(finalPay(CASE))));
    expect(payslipFileName(data)).toBe("FinalPay_EMP-157_2026-12-01_2026-12-15.pdf");
    const pdf = await renderPayslipPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.PAY157_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.PAY157_PDF_OUT, pdf);
  });

  it("FP5 a taxable separation pay is an earnings line", () => {
    const r = computeSheet(finalPay({ ...CASE, sepTaxable: true }));
    const data = buildPayslipPdfData(source(r));
    expect(data.earnings.map((l) => l.label)).toContain("Separation pay (taxable)");
    expect(data.additions).toEqual([]);
    expect(data.earnings.reduce((t, l) => t + l.amount, 0n)).toBe(r.grossCompensationCents);
  });
});
