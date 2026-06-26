/**
 * Deduction-cap safeguard ("no negative pay" policy) — checkDeductionCap.
 *
 * The helper normalises everything to a MONTHLY basis: statutory contributions
 * are inherently monthly; per-period loan installments are scaled by pay
 * frequency. These tests pin the arithmetic with a stubbed Prisma tx and
 * mocked statutory compute so expected values are formula-derived, not engine-
 * captured.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Statutory compute is mocked so the employee-share amounts are deterministic
// and the cap arithmetic is the only thing under test.
vi.mock("@/lib/statutory/compute", () => ({
  computeSSS: () => ({ employee: 1350_00n }),
  computePhilHealth: () => ({ employee: 750_00n }),
  computePagibig: () => ({ employee: 200_00n }),
}));

// resolveAllRules is mocked; payloads are irrelevant because compute is stubbed.
const resolveAllRules = vi.fn(async () => ({ sss: {}, philHealth: {}, pagibig: {} }));
vi.mock("@/lib/payroll/persist", () => ({
  resolveAllRules: () => resolveAllRules(),
}));

import { checkDeductionCap } from "@/lib/payroll/deduction-cap";

const TENANT = "t1";
const EMP = "e1";
const ASOF = new Date("2026-06-26");

interface MockShape {
  term: { basicSalaryCents: bigint; salaryType: string } | null;
  employee: { payFrequency: string } | null;
  workingDaysDenominator: number;
  loans: { installmentCents: bigint }[];
}

/** Build a stub Prisma tx that answers exactly the queries the helper makes. */
function makeTx(s: MockShape) {
  return {
    employmentTerm: { findFirst: async () => s.term },
    employee: { findFirst: async () => s.employee },
    tenant: {
      findUniqueOrThrow: async () => ({
        workingDaysDenominator: s.workingDaysDenominator,
      }),
    },
    loan: { findMany: async () => s.loans },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  resolveAllRules.mockReset();
  resolveAllRules.mockResolvedValue({ sss: {}, philHealth: {}, pagibig: {} });
});

describe("checkDeductionCap", () => {
  // Statutory EE total (mocked) = 1350 + 750 + 200 = ₱2,300/month.
  const STAT = 2300_00n;

  it("allows a loan that stays within the cap", async () => {
    // Monthly gross ₱30,000; cap 50% = ₱15,000.
    // SEMI_MONTHLY (ppm 2), no existing loans, new installment ₱1,000/period.
    // monthlyLoan = 1,000 × 2 = ₱2,000; total = 2,300 + 2,000 = ₱4,300 ≤ 15,000.
    const tx = makeTx({
      term: { basicSalaryCents: 30000_00n, salaryType: "MONTHLY" },
      employee: { payFrequency: "SEMI_MONTHLY" },
      workingDaysDenominator: 313,
      loans: [],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 1000_00n, 50, ASOF);
    expect(r).not.toBeNull();
    expect(r!.withinCap).toBe(true);
    expect(r!.monthlyGrossCents).toBe(30000_00n);
    expect(r!.monthlyStatutoryCents).toBe(STAT);
    expect(r!.capCents).toBe(15000_00n);
    expect(r!.monthlyLoanCents).toBe(2000_00n);
    // room = (15,000 − 2,300)/2 = ₱6,350 per period (no existing loans).
    expect(r!.remainingPerPeriodCents).toBe(6350_00n);
  });

  it("blocks a loan that breaches the cap", async () => {
    // New installment ₱7,000/period × 2 = ₱14,000; total 2,300 + 14,000 =
    // ₱16,300 > ₱15,000 → over cap.
    const tx = makeTx({
      term: { basicSalaryCents: 30000_00n, salaryType: "MONTHLY" },
      employee: { payFrequency: "SEMI_MONTHLY" },
      workingDaysDenominator: 313,
      loans: [],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 7000_00n, 50, ASOF);
    expect(r!.withinCap).toBe(false);
    expect(r!.monthlyLoanCents).toBe(14000_00n);
  });

  it("counts existing active loans against the cap", async () => {
    // Existing ₱5,000/period loan + new ₱2,000/period = ₱7,000 × 2 = ₱14,000;
    // total 2,300 + 14,000 = ₱16,300 > ₱15,000 → over cap even though the new
    // loan alone would fit.
    const tx = makeTx({
      term: { basicSalaryCents: 30000_00n, salaryType: "MONTHLY" },
      employee: { payFrequency: "SEMI_MONTHLY" },
      workingDaysDenominator: 313,
      loans: [{ installmentCents: 5000_00n }],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 2000_00n, 50, ASOF);
    expect(r!.withinCap).toBe(false);
    // remaining BEFORE this loan = (15,000−2,300)/2 − 5,000 = 6,350 − 5,000 = ₱1,350.
    expect(r!.remainingPerPeriodCents).toBe(1350_00n);
  });

  it("scales a DAILY salary to a monthly equivalent", async () => {
    // ₱1,000/day × denominator 312 / 12 = ₱26,000/month.
    const tx = makeTx({
      term: { basicSalaryCents: 1000_00n, salaryType: "DAILY" },
      employee: { payFrequency: "DAILY" },
      workingDaysDenominator: 312,
      loans: [],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 100_00n, 50, ASOF);
    expect(r!.monthlyGrossCents).toBe(26000_00n);
  });

  it("returns null when there is no in-force salary to evaluate", async () => {
    const tx = makeTx({
      term: null,
      employee: { payFrequency: "SEMI_MONTHLY" },
      workingDaysDenominator: 313,
      loans: [],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 1000_00n, 50, ASOF);
    expect(r).toBeNull();
  });

  it("falls back to a loans-only cap when statutory rules are unavailable", async () => {
    resolveAllRules.mockRejectedValueOnce(new Error("rules not seeded"));
    const tx = makeTx({
      term: { basicSalaryCents: 30000_00n, salaryType: "MONTHLY" },
      employee: { payFrequency: "SEMI_MONTHLY" },
      workingDaysDenominator: 313,
      loans: [],
    });
    const r = await checkDeductionCap(tx, TENANT, EMP, 1000_00n, 50, ASOF);
    expect(r!.monthlyStatutoryCents).toBe(0n);
    // Loans-only: 2,000 ≤ 15,000 → still within cap, full room available.
    expect(r!.withinCap).toBe(true);
    expect(r!.remainingPerPeriodCents).toBe(7500_00n);
  });
});
