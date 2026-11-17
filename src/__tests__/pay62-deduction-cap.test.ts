/**
 * PAY-62 (unit 1.7, golden-case finding S3): the company's maximum-deduction
 * cap (Pay Rules, Tenant.maxDeductionPctOfGross, default 50%) was only checked
 * when a loan was added, never when payroll ran. A loan added within the cap
 * could take far more in a short cutoff.
 *
 *   C1  (T1) a regular run: government contributions plus loan installments
 *       stop at the cap (50% of the period's gross); the rest of the
 *       installment is deferred in the loan balance, and contributions are
 *       taken in full.
 *   C2  contributions alone above the cap: no loan is taken this period,
 *       contributions are still taken in full, nothing goes below zero.
 *   C3  a 13th month run: loans stop at the cap of the 13th month's gross.
 *   C4  no cap supplied (FINAL_PAY, or a caller without it): only the
 *       zero-net floor applies, as before; and the run loads the company's
 *       setting in all three run paths.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const LOAN = (installment: bigint, balance = 10_000_000n) => ({
  id: "L1",
  loanType: "COMPANY" as const,
  installmentCents: installment,
  balanceCents: balance,
});

function input(extra: Partial<ComputeInput>, pct: number | null = 50): ComputeInput {
  return {
    employee: {
      id: "p62-emp",
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
      ...(pct === null ? {} : { maxDeductionPctOfGross: pct }),
    },
    period: { start: d("2026-11-01"), end: d("2026-11-15"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 11,
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
    overrideStatutoryDeducted: true,
    ...extra,
  };
}

const contribs = (r: ReturnType<typeof computeSheet>) => r.sssEeCents + r.philhealthEeCents + r.pagibigEeCents;

describe("PAY-62 the maximum-deduction cap applies when payroll runs", () => {
  it("C1 (T1) contributions plus loans stop at 50% of the period's gross", () => {
    const r = computeSheet(input({ loans: [LOAN(1_000_000n)] }));
    expect(r.grossCompensationCents).toBe(1_250_000n); // half of ₱25,000
    const cap = 625_000n; // 50% of ₱12,500
    const c = contribs(r);
    expect(c).toBeGreaterThan(0n);
    expect(r.loanDeductionsCents).toBe(cap - c);
    expect(c + r.loanDeductionsCents).toBe(cap);
    expect(r.loanDeferredCents).toBe(1_000_000n - (cap - c));
    expect(r.loanPaymentsApplied).toEqual([
      expect.objectContaining({ loanId: "L1", amountCents: (cap - c).toString(), balanceAfterCents: (10_000_000n - (cap - c)).toString() }),
    ]);
    expect(r.netPayCents).toBeGreaterThan(0n);

    // A loan inside the cap is taken whole.
    const small = computeSheet(input({ loans: [LOAN(100_000n)] }));
    expect(small.loanDeductionsCents).toBe(100_000n);
    expect(small.loanDeferredCents).toBe(0n);
  });

  it("C2 contributions alone above the cap: no loan this period, contributions in full", () => {
    // 2 days worked: gross ₱1,915.71; full-month contributions are far above 50% of it.
    const r = computeSheet(input({ periodInput: { ...input({}).periodInput, daysWorked: 2, unpaidLeaveDays: 9 }, loans: [LOAN(500_000n)] }));
    const capped = computeSheet(input({ periodInput: { ...input({}).periodInput, daysWorked: 2, unpaidLeaveDays: 9 } }));
    expect(contribs(r)).toBe(contribs(capped)); // contributions untouched by the cap
    expect(contribs(r) * 2n).toBeGreaterThan(r.grossCompensationCents);
    expect(r.loanDeductionsCents).toBe(0n);
    expect(r.loanDeferredCents).toBe(500_000n);
  });

  it("C3 a 13th month run: loans stop at 50% of the 13th month", () => {
    const r = computeSheet(input({ runType: "YEAR_END", thirteenthMonthCents: 2_000_000n, loans: [LOAN(1_500_000n)] }));
    expect(r.grossCompensationCents).toBe(2_000_000n);
    expect(r.loanDeductionsCents).toBe(1_000_000n);
    expect(r.loanDeferredCents).toBe(500_000n);
  });

  it("C4 without a cap only the zero floor applies; every run path loads the setting", () => {
    const r = computeSheet(input({ loans: [LOAN(1_000_000n)] }, null));
    expect(r.loanDeductionsCents).toBe(1_000_000n); // the old behaviour: only net ≥ 0
    expect(r.netPayCents).toBe(42_380n); // ₱12,500 − ₱2,075 contributions − ₱1.20 tax − ₱10,000

    const persist = readFileSync("src/lib/payroll/persist.ts", "utf8");
    expect(persist.match(/allowNegativeFinalPay: true,\n\s+maxDeductionPctOfGross: true,/g)).toHaveLength(3);
    const engine = readFileSync("src/lib/payroll/engine.ts", "utf8");
    // REGULAR/OFF_CYCLE and YEAR_END apply it; FINAL_PAY does not.
    expect(engine.match(/loanCapHeadroom\(tenant\.maxDeductionPctOfGross/g)).toHaveLength(2);
  });

  it("C5 Pay Rules says the limit is applied in every run, not only when a loan is added", () => {
    const page = readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8");
    expect(page).toContain("every payroll run (regular, off-cycle and 13th month) deducts loan installments only up to the limit");
  });
});
