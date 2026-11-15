/**
 * Unit 1.8 (S4): monthly means monthly. The engine paid a MONTHLY-rated
 * employee dailyRate × daysWorked, so ₱30,000/month grossed ₱27,586.20 to
 * ₱31,724.13 depending on the calendar. Rulings D-S1 to D-S7 (14 Aug 2026),
 * R88, R89, R103 to R106 (3 Sep 2026); gaps settled 15 Nov 2026 (G1 to G4).
 *
 *   T1  ₱30,000/month grosses exactly ₱30,000.00 at 20, 21, 22 and 23
 *       working days with no unpaid days.
 *   T2  semi-monthly: exactly ₱15,000.00 per cutoff, both cutoffs, whatever
 *       the working days; an odd centavo goes to the first half.
 *   T3  one unpaid day deducts exactly monthly × 12 / divisor (HALF-UP), at
 *       261 and 313, the divisor taken from the EMPLOYEE field (the tenant's
 *       only when the employee has none); the divisor used is snapshotted.
 *   T4  DAILY-rated pay is unchanged (days present × rate).
 *   T5  WEEKLY on a six-day week grosses exactly the weekly rate; one unpaid
 *       day deducts weekly ÷ 6; the old hardcoded ÷ 5 is gone and days per
 *       week come from the divisor (round(divisor / 52)).
 *   T6e the engine refuses an incoherent salary type × cycle (R88).
 *   T7  STATUTORY DOES NOT MOVE: SSS, PhilHealth and Pag-IBIG follow the
 *       monthly equivalent, not attendance or the new base pay. An invariant:
 *       it passes before and after this unit.
 *   G1  OFF_CYCLE runs keep attendance pay (days worked × daily rate).
 *   G2  a cutoff the employee joined or left part-way through is paid for the
 *       days worked; full cutoffs pay the contract.
 *       (G4, BI_WEEKLY, is tested on the rates module in u1-8-pairings: BIR
 *       publishes no bi-weekly withholding table, so the engine cannot
 *       compute a BI_WEEKLY sheet at all, before or after this unit.)
 *   R7 REP-7: an impossible divisor is refused; unpaid days never take base
 *       pay below zero.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { computePagibig, computePhilHealth, computeSSS } from "@/lib/statutory/compute";
import type { ComputeInput } from "@/lib/payroll/types";
import type {
  BirWithholdingPayload,
  DeMinimisCeilingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

// Statutory fixtures: the same shapes engine.test.ts builds (copied, not
// imported, so that file keeps its two R103-authorised changes only).
function buildSSSTable(): SssSchedulePayload {
  const rows = [];
  for (let msc = 500_000; msc <= 3_500_000; msc += 50_000) {
    const n = (msc - 500_000) / 50_000;
    const isLast = msc === 3_500_000;
    const regularBase = Math.min(msc, 2_000_000);
    const mpfBase = Math.max(0, msc - 2_000_000);
    const regularSSEmployer = Math.round(regularBase * 0.1);
    const regularSSEmployee = Math.round(regularBase * 0.05);
    const ecEmployer = msc > 1_475_000 ? 3_000 : 1_000;
    const mpfEmployer = Math.round(mpfBase * 0.1);
    const mpfEmployee = Math.round(mpfBase * 0.05);
    rows.push({
      compensationFrom: n === 0 ? 0 : 475_000 + n * 50_000,
      compensationTo: isLast ? 99_999_999 : 500_000 + n * 50_000 + 25_000 - 1,
      msc,
      regularSSEmployer, regularSSEmployee, regularSSTotal: regularSSEmployer + regularSSEmployee,
      ecEmployer, mpfEmployer, mpfEmployee, mpfTotal: mpfEmployer + mpfEmployee,
      totalEmployer: regularSSEmployer + ecEmployer + mpfEmployer,
      totalEmployee: regularSSEmployee + mpfEmployee,
      totalTotal: regularSSEmployer + ecEmployer + mpfEmployer + regularSSEmployee + mpfEmployee,
    });
  }
  return { rows };
}
const SSS: SssSchedulePayload = buildSSSTable();
const PHIC: PhilHealthSchedulePayload = {
  rate: 0.05, split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 }, premium: { min: 50_000, max: 500_000 },
};
const PAGIBIG: PagibigSchedulePayload = {
  mfsCap: 1_000_000,
  brackets: [{ upTo: 150_000, eeRate: 0.01, erRate: 0.02 }, { upTo: null, eeRate: 0.02, erRate: 0.02 }],
};
const BIR: BirWithholdingPayload = {
  frequencies: {
    WEEKLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 480_800, fixedTax: 0, plusRate: 0.15 }],
    SEMI_MONTHLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 1_041_700, fixedTax: 0, plusRate: 0.15 }],
    MONTHLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 2_083_300, fixedTax: 0, plusRate: 0.15 }],
  },
};
const MIN_WAGE: MinimumWagePayload = { regions: { NCR: { label: "NCR", dailyRate: 61_000, basis: "test" } } };
const DE_MINIMIS: DeMinimisCeilingPayload = { items: [] };

type Cycle = ComputeInput["period"]["cycle"];
const PERIODS: Record<string, { start: string; end: string; cycle: Cycle }> = {
  month: { start: "2026-01-01", end: "2026-01-31", cycle: "MONTHLY" },
  firstHalf: { start: "2026-01-01", end: "2026-01-15", cycle: "SEMI_MONTHLY" },
  secondHalf: { start: "2026-01-16", end: "2026-01-31", cycle: "SEMI_MONTHLY" },
  week: { start: "2026-01-05", end: "2026-01-11", cycle: "WEEKLY" },
  twoWeeks: { start: "2026-01-05", end: "2026-01-18", cycle: "BI_WEEKLY" },
};

function input(o: {
  salaryType: "MONTHLY" | "WEEKLY" | "DAILY";
  basic: bigint;
  period: keyof typeof PERIODS;
  daysWorked?: number;
  unpaid?: number;
  employeeDivisor?: number | null;
  tenantDivisor?: number;
  otHours?: number;
  runType?: ComputeInput["runType"];
  hireDate?: string;
  separationDate?: string | null;
}): ComputeInput {
  const p = PERIODS[o.period];
  return {
    employee: {
      id: "u18-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: p.cycle,
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: o.employeeDivisor ?? null,
      hireDate: new Date(o.hireDate ?? "2020-01-01"),
      separationDate: o.separationDate ? new Date(o.separationDate) : null,
    },
    salary: { basicSalaryCents: o.basic, salaryType: o.salaryType },
    tenant: {
      workingDaysDenominator: o.tenantDivisor ?? 261,
      statutoryCutoffRule: "SECOND_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
      allowNegativeFinalPay: true,
    },
    period: { start: new Date(p.start), end: new Date(p.end), cycle: p.cycle },
    periodInput: {
      daysWorked: o.daysWorked ?? 0,
      lateUndertimeMinutes: 0,
      regularOtHours: o.otHours ?? 0,
      restDayHours: 0,
      specialHolidayHours: 0,
      regularHolidayHours: 0,
      nightDiffHours: 0,
      hazardHours: 0,
      unpaidLeaveDays: o.unpaid ?? 0,
    },
    payComponents: [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: true,
    runType: o.runType,
  };
}

const MONTHLY_30K = 3_000_000n; // ₱30,000.00

describe("1.8 T1: a full month pays the monthly rate exactly", () => {
  it.each([20, 21, 22, 23])("₱30,000/month at %i working days, no unpaid days, grosses ₱30,000.00", (days) => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: days }));
    expect(r.basePayCents).toBe(3_000_000n);
  });
});

describe("1.8 T2: semi-monthly pays fixed halves", () => {
  it.each([
    ["firstHalf", 10],
    ["firstHalf", 11],
    ["secondHalf", 11],
    ["secondHalf", 12],
  ] as const)("%s with %i working days pays exactly ₱15,000.00", (period, days) => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period, daysWorked: days }));
    expect(r.basePayCents).toBe(1_500_000n);
  });

  it("an odd centavo goes to the first half; the halves add up to the monthly rate", () => {
    const first = computeSheet(input({ salaryType: "MONTHLY", basic: 3_000_001n, period: "firstHalf", daysWorked: 11 }));
    const second = computeSheet(input({ salaryType: "MONTHLY", basic: 3_000_001n, period: "secondHalf", daysWorked: 11 }));
    expect(first.basePayCents).toBe(1_500_001n);
    expect(second.basePayCents).toBe(1_500_000n);
    expect(first.basePayCents + second.basePayCents).toBe(3_000_001n);
  });
});

describe("1.8 T3: one unpaid day deducts monthly × 12 / divisor, from the employee's divisor", () => {
  it("employee divisor 261 (tenant 313): deducts ₱1,379.31; snapshot shows 261", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 21, unpaid: 1, employeeDivisor: 261, tenantDivisor: 313 }));
    // 3,000,000 × 12 / 261 = 137,931.03 → 137,931 (HALF-UP)
    expect(r.basePayCents).toBe(3_000_000n - 137_931n);
    expect(r.workingDaysDenominatorSnapshot).toBe(261);
  });

  it("employee divisor 313 (tenant 261): deducts ₱1,150.16; snapshot shows 313", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 25, unpaid: 1, employeeDivisor: 313, tenantDivisor: 261 }));
    // 3,000,000 × 12 / 313 = 115,015.97 → 115,016 (HALF-UP)
    expect(r.basePayCents).toBe(3_000_000n - 115_016n);
    expect(r.workingDaysDenominatorSnapshot).toBe(313);
  });

  it("no employee divisor: the tenant's is used and snapshotted", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 21, unpaid: 1, employeeDivisor: null, tenantDivisor: 261 }));
    expect(r.basePayCents).toBe(3_000_000n - 137_931n);
    expect(r.workingDaysDenominatorSnapshot).toBe(261);
  });

  it("an unpaid day in a semi-monthly cutoff comes off that half", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "secondHalf", daysWorked: 10, unpaid: 1, employeeDivisor: 261 }));
    expect(r.basePayCents).toBe(1_500_000n - 137_931n);
  });
});

describe("1.8 T4: DAILY-rated pay is unchanged", () => {
  it.each(["month", "firstHalf", "week"] as const)("₱1,000/day × 11 days = ₱11,000.00 on a %s period", (period) => {
    const r = computeSheet(input({ salaryType: "DAILY", basic: 100_000n, period, daysWorked: 11 }));
    expect(r.basePayCents).toBe(1_100_000n);
  });

  it("unpaid days do not reduce a daily-rated employee's pay twice", () => {
    const r = computeSheet(input({ salaryType: "DAILY", basic: 100_000n, period: "month", daysWorked: 11, unpaid: 2 }));
    expect(r.basePayCents).toBe(1_100_000n);
  });
});

describe("1.8 T5: weekly pay", () => {
  const WEEKLY_6K = 600_000n; // ₱6,000/week, six-day week

  it("a full week on a six-day week grosses exactly the weekly rate", () => {
    const r = computeSheet(input({ salaryType: "WEEKLY", basic: WEEKLY_6K, period: "week", daysWorked: 6, employeeDivisor: 313 }));
    expect(r.basePayCents).toBe(600_000n);
  });

  it("one unpaid day deducts weekly ÷ 6 on a six-day week", () => {
    const r = computeSheet(input({ salaryType: "WEEKLY", basic: WEEKLY_6K, period: "week", daysWorked: 5, unpaid: 1, employeeDivisor: 313 }));
    expect(r.basePayCents).toBe(600_000n - 100_000n);
  });

  it("the ÷ 5 is gone: OT on a six-day week uses weekly ÷ 6 (₱125/hr × 1.25)", () => {
    const r = computeSheet(input({ salaryType: "WEEKLY", basic: WEEKLY_6K, period: "week", daysWorked: 6, employeeDivisor: 313, otHours: 1 }));
    expect(r.otPayCents).toBe(15_625n);
  });

  it("days per week come from the divisor: 261 gives a five-day week (÷ 5)", () => {
    const r = computeSheet(input({ salaryType: "WEEKLY", basic: WEEKLY_6K, period: "week", daysWorked: 4, unpaid: 1, employeeDivisor: 261, otHours: 1 }));
    expect(r.basePayCents).toBe(600_000n - 120_000n);
    expect(r.otPayCents).toBe(18_750n);
  });
});

describe("1.8 T6e: the engine refuses an incoherent salary type × cycle (R88)", () => {
  it.each([
    ["MONTHLY", "week"],
    ["WEEKLY", "firstHalf"],
    ["WEEKLY", "month"],
  ] as const)("%s salary on a %s period throws", (salaryType, period) => {
    expect(() => computeSheet(input({ salaryType, basic: 600_000n, period, daysWorked: 5 }))).toThrow(/cannot be paid on a/);
  });
});

describe("1.8 T7: STATUTORY DOES NOT MOVE", () => {
  // Hand-written oracle (REP-2): the monthly equivalent the statutory tables
  // read, computed here from the salary alone, never from the engine.
  const cases = [
    { label: "MONTHLY ₱30,000", salaryType: "MONTHLY" as const, basic: MONTHLY_30K, period: "month" as const, monthlyEq: 3_000_000n },
    { label: "DAILY ₱1,000 @261", salaryType: "DAILY" as const, basic: 100_000n, period: "month" as const, monthlyEq: (100_000n * 261n) / 12n },
    { label: "WEEKLY ₱6,000", salaryType: "WEEKLY" as const, basic: 600_000n, period: "week" as const, monthlyEq: (600_000n * 52n) / 12n },
  ];

  it.each(cases)("$label: contributions equal the tables at the monthly equivalent, whatever the attendance", (c) => {
    const sss = computeSSS(SSS, c.monthlyEq);
    const phic = computePhilHealth(PHIC, c.monthlyEq);
    const hdmf = computePagibig(PAGIBIG, c.monthlyEq);
    // Attendance cases with earnings under both the old and the new base pay
    // (the engine rightly skips contributions on a period with no earnings).
    for (const att of [{ daysWorked: 22, unpaid: 0 }, { daysWorked: 15, unpaid: 4 }, { daysWorked: 1, unpaid: 0 }]) {
      const r = computeSheet(input({ salaryType: c.salaryType, basic: c.basic, period: c.period, ...att }));
      expect([r.sssEeCents, r.sssErCents, r.philhealthEeCents, r.philhealthErCents, r.pagibigEeCents, r.pagibigErCents]).toEqual(
        [sss.employee, sss.employer, phic.employee, phic.employer, hdmf.employee, hdmf.employer],
      );
    }
  });

  it("₱30,000/month: SSS ₱1,500.00 / ₱3,000.00, PhilHealth ₱750.00 each, Pag-IBIG ₱200.00 each (Case A values)", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 22 }));
    expect([r.sssEeCents, r.sssErCents, r.philhealthEeCents, r.philhealthErCents, r.pagibigEeCents, r.pagibigErCents]).toEqual(
      [150_000n, 300_000n, 75_000n, 75_000n, 20_000n, 20_000n],
    );
  });
});

describe("1.8 G1: off-cycle runs keep attendance pay", () => {
  it("OFF_CYCLE with no days worked pays no base salary", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 0, runType: "OFF_CYCLE" }));
    expect(r.basePayCents).toBe(0n);
  });
});

describe("1.8 G2: a cutoff joined or left part-way through is paid for days worked", () => {
  it("hired on the 12th: the first half pays days worked × daily rate (4 × ₱1,379.31)", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "firstHalf", daysWorked: 4, hireDate: "2026-01-12" }));
    expect(r.basePayCents).toBe(137_931n * 4n);
  });

  it("last day on the 20th: the second half pays days worked", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "secondHalf", daysWorked: 3, separationDate: "2026-01-20" }));
    expect(r.basePayCents).toBe(137_931n * 3n);
  });

  it("hired on the first day of the cutoff and still employed: the full half", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "secondHalf", daysWorked: 11, hireDate: "2026-01-16" }));
    expect(r.basePayCents).toBe(1_500_000n);
  });
});

describe("1.8 R7 (REP-7): degenerate inputs", () => {
  it.each([0, 25, 367])("divisor %i is refused", (d) => {
    expect(() => computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "month", daysWorked: 22, employeeDivisor: d }))).toThrow(/divisor/i);
  });

  it("unpaid days worth more than the cutoff take base pay to zero, never below", () => {
    const r = computeSheet(input({ salaryType: "MONTHLY", basic: MONTHLY_30K, period: "firstHalf", daysWorked: 0, unpaid: 11, employeeDivisor: 261 }));
    expect(r.basePayCents).toBe(0n);
  });
});
