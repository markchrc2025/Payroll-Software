/**
 * PAY-202 (Mark, 20 Nov 2026, ruling 4): "Lates are deducted to basic pay,
 * the basic pay less lates is the basic pay for the cutoff. Meaning it will be
 * the base computation for tax, sss, philhealth, and 13th month."
 *
 * Hand figures. A minimum wage earner in NCR on 13,267.50 a month (610.00 a
 * day x 261 / 12), paid semi-monthly: basic 6,633.75 for 1 to 15 Nov. One
 * hour late: 610.00 / 8 = 76.25. Basic less lates: 6,557.50.
 *
 *   T1  the minimum wage exemption is basic less lates, 6,557.50, not
 *       6,633.75 (fails on main).
 *   T2  with a taxable allowance of 2,000.00, taxable pay is the allowance
 *       less nothing else exempt: gross 8,557.50, exempt wage 6,557.50, so
 *       taxable is 2,000.00 less the employee's contributions. On main it was
 *       76.25 too low (fails on main).
 *   T3  PhilHealth uses the same base as SSS: the previous month's basic less
 *       lates; the contracted salary for a new hire's first month, a month not
 *       in Sentire, or a month with no basic earned.
 *   T4  Pag-IBIG stays on the contracted salary; gross (the tax base) is
 *       basic less lates for an employee who is not a minimum wage earner.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { philHealthCompensationCents } from "@/lib/payroll/sss-basis";
import { computePagibig, computePhilHealth } from "@/lib/statutory/compute";
import type { ComputeInput } from "@/lib/payroll/types";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function input(o: {
  mwe: boolean;
  salary: bigint;
  lateMinutes: number;
  allowance?: bigint;
  basis?: ComputeInput["sssBasis"];
}): ComputeInput {
  return {
    employee: {
      id: "p202-emp",
      taxClassification: o.mwe ? "MWE" : "REGULAR",
      region: "NCR",
      payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d("2025-01-06"),
      separationDate: null,
    },
    salary: { basicSalaryCents: o.salary, salaryType: "MONTHLY" },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d("2026-11-01"), end: d("2026-11-15"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 0, lateUndertimeMinutes: o.lateMinutes, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0,
      regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0,
    },
    payComponents: o.allowance
      ? [{ id: "a", code: "ALLOW", name: "Allowance", kind: "ALLOWANCE", taxability: "TAXABLE", amountCents: o.allowance } as never]
      : [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: true,
    runType: "REGULAR",
    sssBasis: o.basis,
  };
}

const MWE_MONTHLY = 1_326_750n; // 610.00 x 261 / 12

describe("PAY-202 basic pay less lates", () => {
  it("T1 the minimum wage exemption is basic less lates", () => {
    const r = computeSheet(input({ mwe: true, salary: MWE_MONTHLY, lateMinutes: 60 }));
    expect(r.basePayCents).toBe(663_375n);
    expect(r.lateUndertimeDeductionCents).toBe(7_625n);
    expect(r.grossCompensationCents).toBe(655_750n);
    expect(r.mweExemptCompensationCents).toBe(655_750n);
  });

  it("T2 a minimum wage earner's taxable pay is not understated by the lates", () => {
    const r = computeSheet(input({ mwe: true, salary: MWE_MONTHLY, lateMinutes: 60, allowance: 200_000n }));
    expect(r.grossCompensationCents).toBe(855_750n);
    expect(r.mweExemptCompensationCents).toBe(655_750n);
    const ee = r.sssEeCents + r.philhealthEeCents + r.pagibigEeCents;
    expect(r.grossTaxableIncomeCents).toBe(200_000n - ee);
    // Gross less exempt wage less contributions equals taxable pay, to the centavo.
    expect(r.grossCompensationCents - r.mweExemptCompensationCents - r.nontaxableCompensationCents).toBe(r.grossTaxableIncomeCents);
  });

  it("T3 PhilHealth on the previous month's basic less lates, like SSS", () => {
    const contract = 2_500_000n;
    expect(philHealthCompensationCents({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n }, contract)).toBe(2_385_057n);
    expect(philHealthCompensationCents({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" }, contract)).toBe(contract);
    expect(philHealthCompensationCents({ kind: "CONTRACTED_FALLBACK", month: "2026-10" }, contract)).toBe(contract);
    expect(philHealthCompensationCents({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 0n }, contract)).toBe(contract);
    expect(philHealthCompensationCents(undefined, contract)).toBe(contract);
    const r = computeSheet(input({ mwe: false, salary: contract, lateMinutes: 0, basis: { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n } }));
    // 23,850.57 x 5% = 1,192.53; employee half 596.27.
    expect(r.philhealthEeCents).toBe(59_627n);
    expect(r.philhealthEeCents).toBe(computePhilHealth(PHIC, 2_385_057n).employee);
  });

  it("T4 Pag-IBIG stays on the contract; the tax base is basic less lates", () => {
    const contract = 2_500_000n;
    const r = computeSheet(input({ mwe: false, salary: contract, lateMinutes: 60, basis: { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n } }));
    expect(r.pagibigEeCents).toBe(computePagibig(PAGIBIG, contract).employee);
    expect(r.grossCompensationCents).toBe(r.basePayCents - r.lateUndertimeDeductionCents);
    expect(r.grossTaxableIncomeCents).toBe(r.grossCompensationCents - r.sssEeCents - r.philhealthEeCents - r.pagibigEeCents);
  });
});
