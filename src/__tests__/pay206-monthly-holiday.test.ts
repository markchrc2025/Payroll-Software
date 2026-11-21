/**
 * PAY-206 (Mark, 21 Nov 2026 22:25): a monthly-paid employee who works a
 * regular holiday is paid 200% in all for the day: the contracted base already
 * pays 100%, so the 8 hours worked add 100% more; hours past 8 add the holiday
 * overtime rate (2.60) on top. Not worked: 100%, in the base.
 * ₱30,000.00 a month, divisor 261: ₱172.41 an hour.
 *
 *   T1  monthly-paid, 8 hours on the holiday: ₱1,379.28 (8 x 172.41) on top of the base
 *       (was ₱2,758.56, i.e. 300% in all); fails on main.
 *   T2  plus 2 hours past 8: 2 x 172.41 x 2.60 = ₱896.53 more.
 *   T3  daily-paid (holiday not in days worked) keeps 200%: 8 x 100.00 x 2.
 *   T4  monthly-paid hired mid-period (base from attendance) keeps 200%.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { DE_MINIMIS_2025, MIN_WAGE_2025, PAGIBIG_2024, PHIC_2025, SSS_2026, TRAIN_2023 } from "@/lib/statutory/baseline-2026";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
function input(type: "MONTHLY" | "DAILY", salary: bigint, pi: Partial<ComputeInput["periodInput"]>, hire = "2024-01-08"): ComputeInput {
  return {
    employee: { id: "e", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY", standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null, hireDate: d(hire), separationDate: null },
    salary: { basicSalaryCents: salary, salaryType: type },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d("2026-11-16"), end: d("2026-11-30"), cycle: "SEMI_MONTHLY" },
    periodInput: { daysWorked: 10, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0, regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0, ...pi },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS_2026, philHealth: PHIC_2025, pagibig: PAGIBIG_2024, bir: TRAIN_2023, minWage: MIN_WAGE_2025, deMinimis: DE_MINIMIS_2025 },
    runType: "REGULAR",
  };
}

describe("PAY-206 monthly-paid regular holiday", () => {
  it("T1 8 hours worked add 100% on top of the base", () => {
    const r = computeSheet(input("MONTHLY", 3_000_000n, { regularHolidayHours: 8 }));
    expect(r.basePayCents).toBe(1_500_000n);
    expect(r.holidayPayCents).toBe(137_928n);
  });
  it("T2 hours past 8 keep the holiday overtime rate", () => {
    const r = computeSheet(input("MONTHLY", 3_000_000n, { regularHolidayHours: 8, regularHolidayOtHours: 2 }));
    expect(r.holidayPayCents).toBe(137_928n + 89_653n);
  });
  it("T3 daily-paid keeps 200%", () => {
    expect(computeSheet(input("DAILY", 80_000n, { regularHolidayHours: 8 })).holidayPayCents).toBe(160_000n);
  });
  it("T4 monthly-paid on attendance base keeps 200%", () => {
    expect(computeSheet(input("MONTHLY", 3_000_000n, { regularHolidayHours: 8 }, "2026-11-20")).holidayPayCents).toBe(275_856n);
  });
});
