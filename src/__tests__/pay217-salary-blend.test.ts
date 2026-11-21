/**
 * Ruling 1 (Mark, 21 Nov 2026 22:25): a salary that changes inside a regular
 * run's period is paid at the old rate for the calendar days before the
 * effective date and the new rate after (rulings 2 and 3: calendar days, basic
 * pay only). Period 16 to 30 Nov 2026 (15 days); new salary from 20 Nov
 * (4 days before, 11 after).
 *
 *   T1  monthly ₱30,000.00 to ₱31,500.00: (15,000.00 x 4 + 15,750.00 x 11) / 15
 *       = 15,550.00 (fails on main: 15,750.00).
 *   T2  daily ₱800.00 to ₱900.00, 10 days: (8,000.00 x 4 + 9,000.00 x 11) / 15
 *       = 8,733.33.
 *   T3  effective on the first day of the period, or a change of salary type:
 *       the new salary for the whole period.
 *   T4  overtime is priced at the new rate.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { DE_MINIMIS_2025, MIN_WAGE_2025, PAGIBIG_2024, PHIC_2025, SSS_2026, TRAIN_2023 } from "@/lib/statutory/baseline-2026";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
type T = "MONTHLY" | "DAILY";
function input(type: T, now: bigint, before?: { cents: bigint; type: T; until: string }, pi: Partial<ComputeInput["periodInput"]> = {}): ComputeInput {
  return {
    employee: { id: "e", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY", standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null, hireDate: d("2024-01-08"), separationDate: null },
    salary: { basicSalaryCents: now, salaryType: type, ...(before ? { before: { basicSalaryCents: before.cents, salaryType: before.type, until: d(before.until) } } : {}) },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d("2026-11-16"), end: d("2026-11-30"), cycle: "SEMI_MONTHLY" },
    periodInput: { daysWorked: 10, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0, regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0, ...pi },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS_2026, philHealth: PHIC_2025, pagibig: PAGIBIG_2024, bir: TRAIN_2023, minWage: MIN_WAGE_2025, deMinimis: DE_MINIMIS_2025 },
    runType: "REGULAR",
  };
}

describe("Salary change inside a period", () => {
  it("T1 monthly", () => {
    expect(computeSheet(input("MONTHLY", 3_150_000n, { cents: 3_000_000n, type: "MONTHLY", until: "2026-11-20" })).basePayCents).toBe(1_555_000n);
  });
  it("T2 daily", () => {
    expect(computeSheet(input("DAILY", 90_000n, { cents: 80_000n, type: "DAILY", until: "2026-11-20" })).basePayCents).toBe(873_333n);
  });
  it("T3 no blend on the first day, or across salary types", () => {
    expect(computeSheet(input("MONTHLY", 3_150_000n, { cents: 3_000_000n, type: "MONTHLY", until: "2026-11-16" })).basePayCents).toBe(1_575_000n);
    expect(computeSheet(input("MONTHLY", 3_150_000n, { cents: 80_000n, type: "DAILY", until: "2026-11-20" })).basePayCents).toBe(1_575_000n);
  });
  it("T4 overtime at the new rate", () => {
    const blended = computeSheet(input("MONTHLY", 3_150_000n, { cents: 3_000_000n, type: "MONTHLY", until: "2026-11-20" }, { regularOtHours: 2 }));
    const plain = computeSheet(input("MONTHLY", 3_150_000n, undefined, { regularOtHours: 2 }));
    expect(blended.otPayCents).toBe(plain.otPayCents);
  });
});
