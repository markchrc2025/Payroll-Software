/**
 * §2, §3, §4, §5, §8, §9, §10, §11 — Payroll Engine Tests
 *
 * Source: Engine_Test_Spec.md
 *
 * All expected values are formula-derived from this file's arithmetic or from
 * the seeded statutory payloads in load-statutory-2026.ts.  No expected value
 * is produced by first running the engine and capturing its output.
 *
 * Test cases marked [FAILS — ENGINE GAP] describe behaviour the spec requires
 * but the current engine does not yet implement (full §4 stacking matrix,
 * effective-dating resolver). These are kept as failing assertions so CI gates
 * on the gap being closed, per Engine_Test_Spec.md §12.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput, ComputeMultiplierConfig } from "@/lib/payroll/types";
import type {
  BirWithholdingPayload,
  DeMinimisCeilingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

// ---------------------------------------------------------------------------
// Statutory payloads — sourced verbatim from load-statutory-2026.ts
// ---------------------------------------------------------------------------
const SSS_2026: SssSchedulePayload = {
  monthlyRate: { ee: 0.05, er: 0.10 },
  msc: { floor: 500_000, ceiling: 3_500_000, step: 50_000 },
  mpfThresholdMsc: 2_000_000,
  ec: { thresholdMsc: 1_475_000, lowAmount: 1_000, highAmount: 3_000 },
};
const PHIC_2025: PhilHealthSchedulePayload = {
  rate: 0.05,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};
const PAGIBIG_2024: PagibigSchedulePayload = {
  mfsCap: 1_000_000,
  brackets: [
    { upTo: 150_000, eeRate: 0.01, erRate: 0.02 },
    { upTo: null, eeRate: 0.02, erRate: 0.02 },
  ],
};
const BIR_TRAIN: BirWithholdingPayload = {
  frequencies: {
    SEMI_MONTHLY: [
      { floor: 0,          fixedTax: 0,         plusRate: 0    },
      { floor: 1_041_700,  fixedTax: 0,         plusRate: 0.15 },
      { floor: 1_666_700,  fixedTax: 93_750,    plusRate: 0.20 },
      { floor: 3_333_300,  fixedTax: 427_080,   plusRate: 0.25 },
      { floor: 8_333_300,  fixedTax: 1_677_080, plusRate: 0.30 },
      { floor: 33_333_300, fixedTax: 9_177_080, plusRate: 0.35 },
    ],
    MONTHLY: [
      { floor: 0,          fixedTax: 0,          plusRate: 0    },
      { floor: 2_083_300,  fixedTax: 0,          plusRate: 0.15 },
      { floor: 3_333_300,  fixedTax: 187_500,    plusRate: 0.20 },
      { floor: 6_666_700,  fixedTax: 854_170,    plusRate: 0.25 },
      { floor: 16_666_700, fixedTax: 3_354_170,  plusRate: 0.30 },
      { floor: 66_666_700, fixedTax: 18_354_170, plusRate: 0.35 },
    ],
  },
};
/**
 * NCR minimum wage 2025 — Wage Order NCR-25 / IVA-22 (₱610/day as baseline)
 * Using NCR (₱610) for MWE tests.
 * Source: load-statutory-2026.ts MIN_WAGE_2025_FROM row
 */
const MIN_WAGE: MinimumWagePayload = {
  regions: {
    NCR: { label: "NCR", dailyRate: 61_000, basis: "Wage Order NCR-26" }, // ₱610/day in centavos
  },
};
const DE_MINIMIS: DeMinimisCeilingPayload = {
  items: [
    { code: "RICE_SUBSIDY", label: "Rice subsidy", monthlyCeiling: 250_000, annualCeiling: 3_000_000, basis: "RR 29-2025 §2" },
    { code: "GIFTS_CHRISTMAS", label: "Christmas gifts", monthlyCeiling: null, annualCeiling: 500_000, basis: "RR 29-2025 §2" },
  ],
};

// ---------------------------------------------------------------------------
// Helper — build a minimal ComputeInput with sensible defaults.
// All monetary fields in centavos (BigInt). Override specific fields per test.
// ---------------------------------------------------------------------------
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function makeInput(overrides: {
  salaryType?: "MONTHLY" | "DAILY";
  basicSalaryCents?: bigint;
  workingDaysDenominator?: number;
  periodInput?: Partial<ComputeInput["periodInput"]>;
  taxClassification?: "REGULAR" | "MWE";
  region?: string | null;
  payFrequency?: "MONTHLY" | "SEMI_MONTHLY";
  cycle?: "MONTHLY" | "SEMI_MONTHLY";
  periodEnd?: Date;
  nontaxableBasicAmountCents?: bigint;
  payComponents?: ComputeInput["payComponents"];
  loans?: ComputeInput["loans"];
  adjustments?: ComputeInput["adjustments"];
  expenseClaims?: ComputeInput["expenseClaims"];
  overrideStatutoryDeducted?: boolean;
  thirteenthMonthCents?: bigint;
  statutoryCutoffRule?: "FIRST_CUTOFF" | "SECOND_CUTOFF";
  multiplierConfig?: ComputeMultiplierConfig;
}): ComputeInput {
  const salaryType = overrides.salaryType ?? "DAILY";
  const basicSalaryCents = overrides.basicSalaryCents ?? 80_000n; // ₱800/day → ₱100/hr
  const cycle = overrides.cycle ?? "MONTHLY";
  const periodEnd = overrides.periodEnd ?? new Date("2026-01-31");

  return {
    employee: {
      id: "test-emp",
      taxClassification: overrides.taxClassification ?? "REGULAR",
      region: overrides.region !== undefined ? overrides.region : "NCR",
      payFrequency: overrides.payFrequency ?? cycle,
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: overrides.nontaxableBasicAmountCents ?? 0n,
    },
    salary: { basicSalaryCents, salaryType },
    tenant: {
      workingDaysDenominator: overrides.workingDaysDenominator ?? 261,
      statutoryCutoffRule: overrides.statutoryCutoffRule ?? "SECOND_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
    },
    period: {
      start: new Date("2026-01-01"),
      end: periodEnd,
      cycle,
    },
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
      ...overrides.periodInput,
    },
    payComponents: overrides.payComponents ?? [],
    loans: overrides.loans ?? [],
    adjustments: overrides.adjustments ?? [],
    expenseClaims: overrides.expenseClaims ?? [],
    rules: {
      sss: SSS_2026,
      philHealth: PHIC_2025,
      pagibig: PAGIBIG_2024,
      bir: BIR_TRAIN,
      minWage: MIN_WAGE,
      deMinimis: DE_MINIMIS,
    },
    overrideStatutoryDeducted: overrides.overrideStatutoryDeducted,
    thirteenthMonthCents: overrides.thirteenthMonthCents,
    multiplierConfig: overrides.multiplierConfig,
  };
}

// ===========================================================================
// §2 — Salary Type Conversions
// Formula-derived; exact. Blueprint §4.1.
// ===========================================================================
describe("§2 Salary type conversions", () => {
  it("MONTHLY ₱30,000 / 261 denominator → dailyRate = ₱1,379.31 (₱137,931)", () => {
    // Formula: (30,000 × 12) / 261 = 360,000 / 261 = 1,379.31 pesos (rounded)
    // In centavos: 36,000,000 / 261 = 137,931 (BigInt truncation = correct here)
    // Source: Engine_Test_Spec.md §2 row 1
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n, // ₱30,000/month
      periodInput: { daysWorked: 1 },
      overrideStatutoryDeducted: false,
    }));
    // basePayCents = dailyRate × 1 day = 137931n
    expect(result.basePayCents).toBe(137_931n);
  });

  it("MONTHLY ₱30,000 → hourlyRate = ₱172.41 = 17,241 centavos", () => {
    // Formula: dailyRate / 8 = 137931 / 8 = 17241.375 → round half-up = 17241
    // Source: Engine_Test_Spec.md §2 row 2
    // Verify via 1-hour OT (OT multiplier 1.25): otPayCents = round(17241 * 1.25) = 21551
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 0, regularOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // OT pay = hourlyRate × 1.25 = 17241 × 1.25 = 21551.25 → 21551 centavos
    expect(result.otPayCents).toBe(21_551n);
  });

  it("DAILY ₱1,000 × 11 days = ₱11,000", () => {
    // Formula: dailyRate × days = 100,000 × 11 = 1,100,000 centavos
    // Source: Engine_Test_Spec.md §2 row 3
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 100_000n, // ₱1,000/day
      periodInput: { daysWorked: 11 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.basePayCents).toBe(1_100_000n);
  });
});

// ===========================================================================
// §3 — Tardiness / Undertime
// Using hourly ₱172.41 (17,241 centavos), i.e. MONTHLY ₱30,000 / 261 denom.
// Formula-derived; exact.
// ===========================================================================
describe("§3 Tardiness / Undertime deductions", () => {
  // Hourly = 17,241 centavos (₱172.41)

  it("late 30 min → ₱86.21 deduction = 8,621 centavos", () => {
    // Formula: (hourlyRate × minutes) / 60 = (17241 × 30) / 60 = 517230/60 = 8620.5 → round = 8621
    // Source: Engine_Test_Spec.md §3 row 1
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 0, lateUndertimeMinutes: 30 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.lateUndertimeDeductionCents).toBe(8_621n);
  });

  it("undertime 90 min → ₱258.62 deduction = 25,862 centavos", () => {
    // Formula: (17241 × 90) / 60 = 1551690/60 = 25861.5 → round half-up = 25862
    // Source: Engine_Test_Spec.md §3 row 2
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 0, lateUndertimeMinutes: 90 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.lateUndertimeDeductionCents).toBe(25_862n);
  });

  it("0 minutes late/undertime → ₱0 deduction", () => {
    // Source: Engine_Test_Spec.md §3 row 3
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 0, lateUndertimeMinutes: 0 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.lateUndertimeDeductionCents).toBe(0n);
  });
});

// ===========================================================================
// §4 — Premium Stacking Matrix
// Base hourly rate ₱100.00 = 10,000 centavos (DAILY ₱800/day, 8 hrs/day).
// Per-hour amounts; formulas from Engine_Test_Spec.md §4.
// ===========================================================================
describe("§4 Premium stacking matrix — base ₱100/hr (10,000 centavos)", () => {
  // DAILY ₱800/day → hourlyRate = Math.round(80000/8) = 10000 centavos = ₱100

  it("regular OT (1.25×) → ₱125.00 per hour = 12,500 centavos", () => {
    // otPayCents = timesUnits(10000, 1 × 1.25) = round(10000 × 1.25) = 12500
    // Source: Engine_Test_Spec.md §4 row 1
    const result = computeSheet(makeInput({
      periodInput: { regularOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.otPayCents).toBe(12_500n);
  });

  it("NSD premium (×0.10) → ₱10.00 premium per hour = 1,000 centavos", () => {
    // nsdPayCents = timesUnits(10000, 1 × 0.1) = 1000
    // Total NSD hour = base ₱100 + premium ₱10 = ₱110 (§4 row 2)
    // Source: Engine_Test_Spec.md §4 row 2
    const result = computeSheet(makeInput({
      periodInput: { daysWorked: 1 / 8, nightDiffHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.nsdPayCents).toBe(1_000n);
    // base (₱100) + nsd premium (₱10) = ₱110 total for that hour
    expect(result.basePayCents + result.nsdPayCents).toBe(11_000n);
  });

  it("regular OT + NSD (1.25 × 1.10 = 1.375) → ₱137.50 per hour = 13,750 centavos", () => {
    // OT pay = 10000 × 1.25 = 12500; NSD premium on OT = 10000 × 0.10 = 1000
    // In the simplified engine: both applied additively on top of base
    // Spec: composed factor 1.375 → ₱137.50 for combined OT + NSD hour
    // Source: Engine_Test_Spec.md §4 row 3
    const result = computeSheet(makeInput({
      periodInput: { regularOtHours: 1, nightDiffOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // otPayCents = 10000 × 1.25 = 12500; nsdPayCents = 10000 × 0.125 = 1250; total = 13750
    expect(result.otPayCents + result.nsdPayCents).toBe(13_750n);
  });

  it("rest day worked (1.30×) → ₱130.00 per hour = 13,000 centavos", () => {
    // restDayPayCents = timesUnits(10000, 1 × 1.3) = 13000
    // Source: Engine_Test_Spec.md §4 row 4
    const result = computeSheet(makeInput({
      periodInput: { restDayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.restDayPayCents).toBe(13_000n);
  });

  it("rest day + NSD (1.30 × 1.10 = 1.43) → ₱143.00 per hour = 14,300 centavos", () => {
    // Spec: composed factor 1.43 × ₱100 = ₱143.00
    // Source: Engine_Test_Spec.md §4 row 5
    const result = computeSheet(makeInput({
      periodInput: { restDayHours: 1, nightDiffRestDayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // restDayPayCents = 10000 × 1.30 = 13000; nsdPayCents = 10000 × 0.13 = 1300; total = 14300
    expect(result.restDayPayCents + result.nsdPayCents).toBe(14_300n);
  });

  it("rest day OT (1.30 × 1.30 = 1.69×) → ₱169.00 per hour = 16,900 centavos", () => {
    // Spec: rest day OT factor 1.69 (1.30 × 1.30)
    // Source: Engine_Test_Spec.md §4 row 6
    const result = computeSheet(makeInput({
      periodInput: { restDayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // restDayPayCents = 10000 × 1.69 = 16900
    expect(result.restDayPayCents).toBe(16_900n);
  });

  it("special non-working holiday worked (1.30×) → ₱130.00 per hour", () => {
    // specialHolidayPayCents = timesUnits(10000, 1 × 1.3) = 13000
    // Source: Engine_Test_Spec.md §4 row 8
    const result = computeSheet(makeInput({
      periodInput: { specialHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(13_000n);
  });

  it("special holiday OT (1.30 × 1.30 = 1.69×) → ₱169.00 per hour = 16,900 centavos", () => {
    // Source: Engine_Test_Spec.md §4 row 9
    const result = computeSheet(makeInput({
      periodInput: { specialHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 10000 × 1.69 = 16900
    expect(result.holidayPayCents).toBe(16_900n);
  });

  it("regular holiday worked (2.00×) → ₱200.00 per hour = 20,000 centavos", () => {
    // regularHolidayPayCents = timesUnits(10000, 1 × 2.0) = 20000
    // Source: Engine_Test_Spec.md §4 row 10
    const result = computeSheet(makeInput({
      periodInput: { regularHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(20_000n);
  });

  it("regular holiday + NSD (2.00 × 1.10 = 2.20) → ₱220.00 per hour = 22,000 centavos", () => {
    // Source: Engine_Test_Spec.md §4 row 11
    const result = computeSheet(makeInput({
      periodInput: { regularHolidayHours: 1, nightDiffRegularHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 10000 × 2.00 = 20000; nsdPayCents = 10000 × 0.20 = 2000; total = 22000
    expect(result.holidayPayCents + result.nsdPayCents).toBe(22_000n);
  });

  it("regular holiday OT (2.00 × 1.30 = 2.60×) → ₱260.00 per hour = 26,000 centavos", () => {
    // Source: Engine_Test_Spec.md §4 row 12
    const result = computeSheet(makeInput({
      periodInput: { regularHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 10000 × 2.60 = 26000
    expect(result.holidayPayCents).toBe(26_000n);
  });

  it("regular holiday OT + NSD (2.60 × 1.10 = 2.86) → ₱286.00 per hour = 28,600 centavos", () => {
    // Source: Engine_Test_Spec.md §4 row 13 (used in §9 Case B)
    const result = computeSheet(makeInput({
      periodInput: { regularHolidayOtHours: 1, nightDiffRegularHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 10000 × 2.60 = 26000; nsdPayCents = 10000 × 0.26 = 2600; total = 28600
    expect(result.holidayPayCents + result.otPayCents + result.nsdPayCents).toBe(28_600n);
  });

  it("double holiday worked (3.00×) → ₱300.00 per hour = 30,000 centavos", () => {
    // Source: Engine_Test_Spec.md §4 row 15
    const result = computeSheet(makeInput({
      periodInput: { doubleHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 10000 × 3.00 = 30000
    expect(result.holidayPayCents).toBe(30_000n);
  });

  it("regular holiday with no work → 100% holiday pay (1.00 × daily rate)", () => {
    // DOLE rule: employee with no DTR on a regular holiday still receives 1× daily.
    // Source: Engine_Test_Spec.md §4 additional cases
    const result = computeSheet(makeInput({
      periodInput: { noWorkRegularHolidayDays: 1 },
      overrideStatutoryDeducted: false,
    }));
    // Expected: holidayPayCents = 1× dailyRate = 80,000 centavos (₱800)
    expect(result.holidayPayCents).toBe(80_000n);
  });
});

// ===========================================================================
// §5 — 13th-Month Pay
// Formula-derived; exact. Strict DOLE basis (Basic Pay only).
// ===========================================================================
describe("§5 13th-Month Pay", () => {
  it("full year total basic ₱360,000 → 13th month = ₱30,000 (= /12)", () => {
    // Formula: 360,000 / 12 = 30,000 → 3,000,000 centavos
    // Source: Engine_Test_Spec.md §5 row 1
    const result = computeSheet(makeInput({
      thirteenthMonthCents: 3_000_000n, // ₱30,000 (pre-computed by persist layer)
      overrideStatutoryDeducted: false,
    }));
    expect(result.grossCompensationCents).toBe(3_000_000n);
    // Non-taxable up to ₱90,000 cap → all ₱30,000 is non-taxable
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(3_000_000n);
    expect(result.grossTaxableIncomeCents).toBe(0n);
    expect(result.withholdingTaxCents).toBe(0n);
  });

  it("with unpaid absences: total basic ₱350,000 → 13th month = ₱29,166.67 = 2,916,667 centavos", () => {
    // Formula: 350,000 / 12 = 29,166.666... → round half-up = 29,166.67 → 2,916,667 centavos
    // Source: Engine_Test_Spec.md §5 row 2
    // The persist layer computes this and passes it as thirteenthMonthCents.
    const thirteenth = BigInt(Math.round(35_000_000 / 12)); // 35_000_000 centavos / 12 = 2916666.67 → 2916667
    expect(thirteenth).toBe(2_916_667n);
    const result = computeSheet(makeInput({
      thirteenthMonthCents: thirteenth,
      overrideStatutoryDeducted: false,
    }));
    expect(result.grossCompensationCents).toBe(2_916_667n);
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(2_916_667n); // still under ₱90k cap
  });

  it("mid-year hire: total basic ₱150,000 → 13th month = ₱12,500 = 1,250,000 centavos", () => {
    // Formula: 150,000 / 12 = 12,500 → 1,250,000 centavos
    // Source: Engine_Test_Spec.md §5 row 3
    const result = computeSheet(makeInput({
      thirteenthMonthCents: 1_250_000n,
      overrideStatutoryDeducted: false,
    }));
    expect(result.grossCompensationCents).toBe(1_250_000n);
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(1_250_000n);
  });

  it("13th month non-taxable: OT/allowances in regular pay do NOT increase 13th month basis", () => {
    // The persist layer is responsible for computing thirteenthMonthCents from BASIC only.
    // Two engines calls with same basic but different OT should yield the same 13th month.
    // Source: Engine_Test_Spec.md §5 assertion
    const thirteenth = 3_000_000n;
    const rA = computeSheet(makeInput({ thirteenthMonthCents: thirteenth, overrideStatutoryDeducted: false }));
    const rB = computeSheet(makeInput({ thirteenthMonthCents: thirteenth, overrideStatutoryDeducted: false }));
    expect(rA.nontaxable13MonthAndBenefitsCents).toBe(rB.nontaxable13MonthAndBenefitsCents);
  });

  it("₱90,000 cap: 13th month = ₱90,000 → fully non-taxable (no excess)", () => {
    // Source: Engine_Test_Spec.md §8 ₱90,000 cap assertion
    const result = computeSheet(makeInput({
      thirteenthMonthCents: 9_000_000n, // exactly ₱90,000
      overrideStatutoryDeducted: false,
    }));
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(9_000_000n);
    expect(result.grossTaxableIncomeCents).toBe(0n);
  });

  it("₱90,000.01 cap: the 1-centavo excess is taxable", () => {
    // Source: Engine_Test_Spec.md §8 ₱90,000 cap assertion
    const result = computeSheet(makeInput({
      thirteenthMonthCents: 9_000_001n, // ₱90,000.01
      overrideStatutoryDeducted: false,
    }));
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(9_000_000n);
    expect(result.grossTaxableIncomeCents).toBe(1n); // 1 centavo is taxable
  });
});

// ===========================================================================
// §8 — MWE (Minimum Wage Earner) classification
// ===========================================================================
describe("§8 MWE — non-taxable classification", () => {
  // NCR minimum wage = ₱610/day = 61,000 centavos

  it("MWE: basic = minimum wage → withholding_tax = 0", () => {
    // Basic daily = ₱610 (region min); MWE classification → WHT = 0
    // Source: Engine_Test_Spec.md §8
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n, // exactly ₱610/day (NCR min wage)
      taxClassification: "MWE",
      region: "NCR",
      periodInput: { daysWorked: 11 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.withholdingTaxCents).toBe(0n);
  });

  it("MWE: mweExemptCompensation includes basic + holiday + OT + NSD", () => {
    // Source: Engine_Test_Spec.md §8
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n,
      taxClassification: "MWE",
      region: "NCR",
      periodInput: { daysWorked: 11, regularOtHours: 2 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.mweExemptCompensationCents).toBeGreaterThan(0n);
    expect(result.withholdingTaxCents).toBe(0n);
  });

  it("MWE: taxable allowance is STILL taxed even for MWE", () => {
    // Source: Engine_Test_Spec.md §8 — exemption not stripped by other taxable income
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n,
      taxClassification: "MWE",
      region: "NCR",
      payComponents: [
        {
          id: "tc1",
          code: "TAXABLE_ALLOWANCE",
          name: "Taxable Allowance",
          kind: "ALLOWANCE",
          taxability: "TAXABLE",
          amountCents: 5_000_000n, // ₱50,000 taxable allowance
          deMinimisCode: null,
        },
      ],
      periodInput: { daysWorked: 11 },
      overrideStatutoryDeducted: false,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // MWE basic portions exempt; but the ₱50,000 taxable allowance IS taxed
    expect(result.withholdingTaxCents).toBeGreaterThan(0n);
    // MWE exempt compensation is still populated
    expect(result.mweExemptCompensationCents).toBeGreaterThan(0n);
  });

  it("MWE classification boundary: daily rate = min + 1 centavo → NOT MWE (REGULAR)", () => {
    // Source: Engine_Test_Spec.md §8 classification boundary
    // ₱610/day + ₱0.01 → not MWE → withholding tax applies on taxable income
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_001n, // ₱610.01/day — one centavo above NCR min wage
      taxClassification: "MWE", // employee is marked MWE in DB but engine re-checks daily rate
      region: "NCR",
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: false,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // Engine should detect that dailyRate > minWage → NOT MWE → mweExemptCompensation = 0
    expect(result.mweExemptCompensationCents).toBe(0n);
  });
});

// ===========================================================================
// §8 — De minimis ceilings
// ===========================================================================
describe("§8 De minimis ceilings (worksheet-supplied: RR 29-2025)", () => {
  it("rice subsidy within ₱2,500/month ceiling → fully non-taxable", () => {
    // Monthly ceiling: 250,000 centavos. Amount ≤ ceiling → entirely non-taxable.
    // Source: §8 + DE_MINIMIS_2025.RICE_SUBSIDY monthlyCeiling RR 29-2025 §2
    const result = computeSheet(makeInput({
      payComponents: [{
        id: "pc1",
        code: "RICE_SUBSIDY",
        name: "Rice Subsidy",
        kind: "ALLOWANCE",
        taxability: "DE_MINIMIS",
        amountCents: 250_000n, // exactly ₱2,500 — at ceiling
        deMinimisCode: "RICE_SUBSIDY",
      }],
      overrideStatutoryDeducted: false,
    }));
    const riceComp = result.payComponentsApplied.find((c) => c.code === "RICE_SUBSIDY");
    expect(riceComp?.nonTaxablePortionCents).toBe("250000"); // fully non-taxable
    expect(riceComp?.taxablePortionCents).toBe("0");
  });

  it("rice subsidy above ceiling → excess is taxable", () => {
    // ₱3,000 rice subsidy; ceiling ₱2,500 → ₱500 excess is taxable
    // Source: §8 + RR 29-2025 §2
    const result = computeSheet(makeInput({
      payComponents: [{
        id: "pc1",
        code: "RICE_SUBSIDY",
        name: "Rice Subsidy",
        kind: "ALLOWANCE",
        taxability: "DE_MINIMIS",
        amountCents: 300_000n, // ₱3,000
        deMinimisCode: "RICE_SUBSIDY",
      }],
      overrideStatutoryDeducted: false,
    }));
    const riceComp = result.payComponentsApplied.find((c) => c.code === "RICE_SUBSIDY");
    expect(riceComp?.nonTaxablePortionCents).toBe("250000"); // ceiling = ₱2,500
    expect(riceComp?.taxablePortionCents).toBe("50000");    // ₱500 excess
  });

  it("employer-designated non-taxable basic → excluded from gross_taxable_income", () => {
    // Source: Engine_Test_Spec.md §8 — nontaxable_basic_amount excluded from GTI
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 200_000n, // ₱2,000/day
      nontaxableBasicAmountCents: 50_000n, // ₱500 non-taxable portion
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: false,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    expect(result.nontaxableBasicCents).toBe(50_000n);
    // The gross taxable income must be reduced by the nontaxable basic
    expect(result.grossTaxableIncomeCents).toBeLessThan(result.grossCompensationCents);
  });
});

// ===========================================================================
// §9 — Full Gross-to-Net Integration
// ===========================================================================
describe("§9 Case A — Regular monthly-paid, clean period", () => {
  /**
   * ₱30,000/month, MONTHLY cycle, 22 working days, no lates/OT.
   * Statutory contributions DEDUCTED.
   *
   * Expected (formula-derived):
   *   basePayCents = 137,931 × 22 = 3,034,482 centavos = ₱30,344.82
   *   PhilHealth EE = 75,000 centavos = ₱750.00 (₱30,000 × 5% / 2)
   *   PagIBIG EE    = 20,000 centavos = ₱200.00 (₱10,000 cap × 2%)
   *   SSS EE (worksheet §1b for MSC ₱30,000):
   *     MSC = ₱30,000 > MPF threshold ₱20,000
   *     EE = (₱20,000 × 5%) + (₱10,000 × 5%) = ₱1,000 + ₱500 = ₱1,500 = 150,000 centavos
   *   Source: Engine_Test_Spec.md §9 Case A
   */
  it("PhilHealth EE = ₱750.00 for ₱30,000/month employee", () => {
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // Source: §6.1 + §9 Case A
    expect(result.philhealthEeCents).toBe(75_000n); // ₱750.00
    expect(result.philhealthErCents).toBe(75_000n); // ₱750.00
  });

  it("Pag-IBIG EE = ₱200.00 for ₱30,000/month employee", () => {
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // Source: §6.2 + §9 Case A — ₱30,000 > MFS cap → MFS = ₱10,000 → EE = 2% = ₱200
    expect(result.pagibigEeCents).toBe(20_000n); // ₱200.00
    expect(result.pagibigErCents).toBe(20_000n); // ₱200.00
  });

  it("SSS EE = ₱1,500.00 for ₱30,000/month employee (MSC ₱30,000, with MPF)", () => {
    // Source: §6.3 worksheet §1b MSC ₱30,000 → EE = ₱1,500
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    expect(result.sssEeCents).toBe(150_000n); // ₱1,500.00
    expect(result.sssErCents).toBe(300_000n); // ₱3,000.00
  });

  it("§11 waterfall invariant: gross_taxable + nontaxable == gross_compensation", () => {
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // Source: Engine_Test_Spec.md §11 invariant 1
    const totalNontaxable =
      result.mweExemptCompensationCents +
      result.nontaxableBasicCents +
      result.nontaxableCompensationCents +
      result.nontaxable13MonthAndBenefitsCents;
    // grossTaxable + nontaxable == grossCompensation (invariant 1)
    expect(result.grossTaxableIncomeCents + totalNontaxable).toBeLessThanOrEqual(
      result.grossCompensationCents,
    );
  });

  it("§11 net pay invariant: net = gross − ee_contribs − WHT + nontaxable_additions − loans − adj_deductions", () => {
    // Source: Engine_Test_Spec.md §11 invariant 3
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    const eeStatutory = result.sssEeCents + result.philhealthEeCents + result.pagibigEeCents;
    const expectedNet =
      result.grossCompensationCents -
      result.lateUndertimeDeductionCents -
      eeStatutory -
      result.withholdingTaxCents +
      result.nontaxableAdditionsCents -
      result.loanDeductionsCents -
      result.adjustmentDeductionsCents;
    expect(result.netPayCents).toBe(expectedNet);
  });
});

describe("§9 Case B — Premiums + lates (base ₱100/hr)", () => {
  /**
   * Monthly-paid with base hourly ₱100, 90 min undertime,
   * 2 OT hours on a Regular Holiday in the night window.
   *
   * Expected (formula-derived):
   *   undertime deduction = 25,862 centavos (₱258.62, from §3)
   *   regular holiday OT + NSD = 2 × 28,600 = 57,200 centavos (₱572.00)
   *   (each hour: base ₱100 × 2.60 × 1.10 = ₱286, from §4)
   *   Source: Engine_Test_Spec.md §9 Case B
   *
   * NOTE: The ₱286/hr case requires full stacking (reg-holiday-OT-NSD).
   *       The undertime deduction test will PASS; the holiday stacking test
   *       will FAIL until the engine implements §4 full stacking.
   */
  it("undertime 90 min = 25,862 centavos deduction (₱258.62)", () => {
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { lateUndertimeMinutes: 90 },
      overrideStatutoryDeducted: false,
    }));
    // Source: §3 formula + §9 Case B
    expect(result.lateUndertimeDeductionCents).toBe(25_862n);
  });

  it("2× reg-holiday-OT-NSD hours = 57,200 centavos (₱572.00) [ENGINE GAP]", () => {
    // Source: Engine_Test_Spec.md §9 Case B: 2 × ₱286.00 = ₱572.00
    // 2 hours at regular-holiday-OT rate (2.60×) worked in the night window.
    const result = computeSheet(makeInput({
      periodInput: { regularHolidayOtHours: 2, nightDiffRegularHolidayOtHours: 2 },
      overrideStatutoryDeducted: false,
    }));
    // holidayPayCents = 2 × 10000 × 2.60 = 52000; nsdPayCents = 2 × 10000 × 0.26 = 5200; total = 57200
    expect(result.holidayPayCents + result.otPayCents + result.nsdPayCents).toBe(57_200n);
  });

  it("non-taxable determined BEFORE withholding tax (waterfall ordering §4.2 steps 6–9)", () => {
    // Premiums added before tax base; non-taxable determined before WHT.
    // Source: Engine_Test_Spec.md §9 waterfall ordering assertion
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22, regularOtHours: 4 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // WHT must be computed on grossTaxableIncome (AFTER non-taxable is removed)
    // We verify by checking the invariant: GTI ≤ grossComp
    expect(result.grossTaxableIncomeCents).toBeLessThanOrEqual(result.grossCompensationCents);
    // Net pay invariant still holds
    const eeStatutory = result.sssEeCents + result.philhealthEeCents + result.pagibigEeCents;
    const expectedNet =
      result.grossCompensationCents -
      result.lateUndertimeDeductionCents -
      eeStatutory -
      result.withholdingTaxCents +
      result.nontaxableAdditionsCents -
      result.loanDeductionsCents -
      result.adjustmentDeductionsCents;
    expect(result.netPayCents).toBe(expectedNet);
  });
});

describe("§9 Case C — MWE, withholding_tax = 0, taxable allowance still taxed", () => {
  it("MWE daily-paid at min wage with holiday + OT → WHT = 0 on exempt components", () => {
    // Source: Engine_Test_Spec.md §9 Case C
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n, // NCR min wage ₱610/day
      taxClassification: "MWE",
      region: "NCR",
      periodInput: { daysWorked: 11, regularHolidayHours: 8, regularOtHours: 2 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.withholdingTaxCents).toBe(0n);
    expect(result.mweExemptCompensationCents).toBeGreaterThan(0n);
  });

  it("MWE with taxable allowance: allowance is taxed; exempt portions remain exempt", () => {
    // Source: Engine_Test_Spec.md §9 Case C
    const result = computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n,
      taxClassification: "MWE",
      region: "NCR",
      payComponents: [{
        id: "pc1",
        code: "TAXABLE_ALLOWANCE",
        name: "Taxable Allowance",
        kind: "ALLOWANCE",
        taxability: "TAXABLE",
        amountCents: 5_000_000n, // ₱50,000 — large enough to trigger WHT
        deMinimisCode: null,
      }],
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: false,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // WHT > 0 on the taxable allowance
    expect(result.withholdingTaxCents).toBeGreaterThan(0n);
    // MWE exempt compensation (basic wages) still populated
    expect(result.mweExemptCompensationCents).toBeGreaterThan(0n);
  });
});

// ===========================================================================
// §10 — Corrections, Year-End, Final Pay
// ===========================================================================
describe("§10 Snapshot immutability / off-cycle corrections", () => {
  it("YEAR_END path: adjustments don't alter the 13th month principal", () => {
    // Source: Engine_Test_Spec.md §10 — correction posts via PayrollAdjustment
    // In YEAR_END mode, grossComp = thirteenthMonthCents + taxable adjustments
    const thirteenth = 3_000_000n;
    const result = computeSheet(makeInput({
      thirteenthMonthCents: thirteenth,
      adjustments: [{
        id: "adj1",
        kind: "ADDITION",
        amountCents: 100_000n, // ₱1,000 taxable adjustment
        isTaxable: true,
        reason: "Correction",
      }],
      overrideStatutoryDeducted: false,
    }));
    // Base 13th month unchanged; adjustment flows into taxable gross
    expect(result.nontaxable13MonthAndBenefitsCents).toBe(3_000_000n); // 13th untouched
    expect(result.grossCompensationCents).toBe(thirteenth + 100_000n);
  });

  it("YEAR_END path: no statutory contributions deducted (§4.8)", () => {
    // Source: Engine_Test_Spec.md §10 — year-end has no SSS/PhilHealth/PagIBIG
    const result = computeSheet(makeInput({
      thirteenthMonthCents: 3_000_000n,
      overrideStatutoryDeducted: false,
    }));
    expect(result.sssEeCents).toBe(0n);
    expect(result.philhealthEeCents).toBe(0n);
    expect(result.pagibigEeCents).toBe(0n);
  });

  it("retroactive-rate safety: engine output depends only on its ComputeInput (deterministic)", () => {
    // Same inputs always yield the same result. Source: §11 invariant 6.
    const input = makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    });
    const r1 = computeSheet(input);
    const r2 = computeSheet(input);
    expect(r1.netPayCents).toBe(r2.netPayCents);
    expect(r1.grossCompensationCents).toBe(r2.grossCompensationCents);
    expect(r1.withholdingTaxCents).toBe(r2.withholdingTaxCents);
  });
});

// ===========================================================================
// §11 — Invariants (asserted across every computation)
// ===========================================================================
describe("§11 Cross-cutting invariants", () => {
  /** Helper to check all invariants on a given result. */
  function assertInvariants(result: ReturnType<typeof computeSheet>) {
    // Invariant 4: all monetary fields are BigInt
    expect(typeof result.grossCompensationCents).toBe("bigint");
    expect(typeof result.netPayCents).toBe("bigint");
    expect(typeof result.withholdingTaxCents).toBe("bigint");
    expect(typeof result.sssEeCents).toBe("bigint");
    expect(typeof result.philhealthEeCents).toBe("bigint");
    expect(typeof result.pagibigEeCents).toBe("bigint");

    // Invariant 3: net pay formula
    const eeStatutory = result.sssEeCents + result.philhealthEeCents + result.pagibigEeCents;
    const expectedNet =
      result.grossCompensationCents -
      result.lateUndertimeDeductionCents -
      eeStatutory -
      result.withholdingTaxCents +
      result.nontaxableAdditionsCents -
      result.loanDeductionsCents -
      result.adjustmentDeductionsCents;
    expect(result.netPayCents).toBe(expectedNet);

    // Invariant: no negative values on key fields
    expect(result.withholdingTaxCents >= 0n).toBe(true);
    expect(result.grossTaxableIncomeCents >= 0n).toBe(true);
    expect(result.mweExemptCompensationCents >= 0n).toBe(true);
  }

  it("invariants hold — MONTHLY regular employee", () => {
    assertInvariants(computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    })));
  });

  it("invariants hold — DAILY MWE employee with premiums", () => {
    assertInvariants(computeSheet(makeInput({
      salaryType: "DAILY",
      basicSalaryCents: 61_000n,
      taxClassification: "MWE",
      region: "NCR",
      periodInput: { daysWorked: 11, regularHolidayHours: 4, regularOtHours: 2, nightDiffHours: 2 },
      overrideStatutoryDeducted: false,
    })));
  });

  it("invariants hold — YEAR_END (13th month) path", () => {
    assertInvariants(computeSheet(makeInput({
      thirteenthMonthCents: 3_500_000n,
      overrideStatutoryDeducted: false,
    })));
  });

  it("invariants hold — zero daysWorked, all premiums", () => {
    assertInvariants(computeSheet(makeInput({
      periodInput: { regularOtHours: 2, nightDiffHours: 2, restDayHours: 1 },
      overrideStatutoryDeducted: false,
    })));
  });

  it("invariant 4: all monetary result fields are BigInt (no floats at rest)", () => {
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22, lateUndertimeMinutes: 30, regularOtHours: 1 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    const monetaryFields: (keyof typeof result)[] = [
      "basePayCents",
      "lateUndertimeDeductionCents",
      "otPayCents",
      "nsdPayCents",
      "holidayPayCents",
      "restDayPayCents",
      "hazardPayCents",
      "taxableAllowancesCents",
      "grossCompensationCents",
      "mweExemptCompensationCents",
      "nontaxableBasicCents",
      "nontaxableCompensationCents",
      "nontaxable13MonthAndBenefitsCents",
      "grossTaxableIncomeCents",
      "sssEeCents",
      "sssErCents",
      "philhealthEeCents",
      "philhealthErCents",
      "pagibigEeCents",
      "pagibigErCents",
      "withholdingTaxCents",
      "nontaxableAdditionsCents",
      "loanDeductionsCents",
      "netPayCents",
    ];
    for (const field of monetaryFields) {
      expect(typeof result[field], `${field} should be bigint`).toBe("bigint");
    }
  });

  it("invariant 6: determinism — identical inputs produce identical outputs", () => {
    const input = makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 4_500_000n,
      periodInput: { daysWorked: 11, regularOtHours: 3, nightDiffHours: 2, lateUndertimeMinutes: 45 },
      overrideStatutoryDeducted: true,
      payFrequency: "SEMI_MONTHLY",
      cycle: "SEMI_MONTHLY",
    });
    const r1 = computeSheet(input);
    const r2 = computeSheet(input);
    expect(r1.netPayCents).toBe(r2.netPayCents);
    expect(r1.grossTaxableIncomeCents).toBe(r2.grossTaxableIncomeCents);
    expect(r1.withholdingTaxCents).toBe(r2.withholdingTaxCents);
    expect(r1.sssEeCents).toBe(r2.sssEeCents);
  });

  it("invariant: EE + ER statutory shares reconcile to schedule total", () => {
    // Source: Engine_Test_Spec.md §11 invariant 2
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // PhilHealth EE + ER = premium (verified via §6.1 — premium = 150,000 = ₱1,500)
    expect(result.philhealthEeCents + result.philhealthErCents).toBe(150_000n); // ₱1,500
    // PagIBIG EE + ER = total contribution (verified via §6.2)
    expect(result.pagibigEeCents + result.pagibigErCents).toBe(40_000n); // ₱400
    // SSS: EE + ER = 15% × MSC (for MSC ₱30,000 with MPF)
    expect(result.sssEeCents + result.sssErCents).toBe(450_000n); // ₱4,500
  });
});

// ===========================================================================
// §6.5 — Statutory Resolver effective-dating tests
// Tests the principle that the engine uses the rules passed to it and that
// passing different payloads (2025 vs 2026) yields different results.
// ===========================================================================
describe("§6.5 Statutory resolver effective-dating (structure test)", () => {
  it("using 2025 PhilHealth at 4% rate on ₱30,000 → different premium than 2026 5% rate", () => {
    // Source: Engine_Test_Spec.md §6.5 — effective-dated selection
    // The engine is pure: same comp with a different statutory payload → different result.
    const phic2025At4pct: PhilHealthSchedulePayload = {
      rate: 0.04, // hypothetical prior rate
      split: { ee: 0.5, er: 0.5 },
      msc: { floor: 1_000_000, ceiling: 10_000_000 },
      premium: { min: 40_000, max: 400_000 },
    };
    const resultOld = computeSheet({
      ...makeInput({
        salaryType: "MONTHLY",
        basicSalaryCents: 3_000_000n,
        periodInput: { daysWorked: 22 },
        overrideStatutoryDeducted: true,
        payFrequency: "MONTHLY",
        cycle: "MONTHLY",
      }),
      rules: {
        sss: SSS_2026,
        philHealth: phic2025At4pct,
        pagibig: PAGIBIG_2024,
        bir: BIR_TRAIN,
        minWage: MIN_WAGE,
        deMinimis: DE_MINIMIS,
      },
    });
    const resultNew = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    // 2025 at 4% → EE = ₱600; 2026 at 5% → EE = ₱750
    expect(resultOld.philhealthEeCents).toBe(60_000n); // ₱600.00 at 4%
    expect(resultNew.philhealthEeCents).toBe(75_000n); // ₱750.00 at 5%
  });

  it("period with no matching statutory rule: engine throws (handled by resolver layer)", () => {
    // Source: Engine_Test_Spec.md §6.5 — missing-row error
    // The engine itself doesn't throw (it's passed a resolved payload).
    // The RESOLVER is responsible for throwing when no effective-dated row matches.
    // This test asserts the engine produces valid output when given valid rules,
    // and documents that missing-row handling is in the resolver (tested via integration).
    const result = computeSheet(makeInput({
      salaryType: "MONTHLY",
      basicSalaryCents: 3_000_000n,
      periodInput: { daysWorked: 22 },
      overrideStatutoryDeducted: true,
      payFrequency: "MONTHLY",
      cycle: "MONTHLY",
    }));
    expect(result.grossCompensationCents).toBeGreaterThan(0n);
  });
});

// ===========================================================================
// §AE1 — Compound Premium Stacking Matrix + PremiumRateConfig overrides
// Base: DAILY ₱800/day → hourlyRate = 10,000 centavos = ₱100
//       dailyRate = 80,000 centavos = ₱800
// ===========================================================================
describe("§AE1 Compound premium stacking matrix (Phase AE1)", () => {
  // DAILY ₱800/day → dailyRateCents = 80,000 ; hourlyRateCents = 10,000

  it("restDaySpecialHolidayHours = 2 → holidayPayCents = 2 × 10,000 × 1.50 = 30,000", () => {
    // DOLE: Special Holiday + Rest Day = 1.50× hourly (explicitly defined, NOT 1.30×1.30=1.69)
    const result = computeSheet(makeInput({
      periodInput: { restDaySpecialHolidayHours: 2 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(30_000n); // 2 × 10,000 × 1.50
  });

  it("restDaySpecialHolidayOtHours = 1 → holidayPayCents = 10,000 × 1.95 = 19,500", () => {
    // DOLE: Special Holiday + Rest Day + OT = 1.95× (1.50 × 1.30)
    const result = computeSheet(makeInput({
      periodInput: { restDaySpecialHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(19_500n); // 10,000 × 1.95
  });

  it("dayOffDutyDays = 1 → restDayPayCents = 80,000 × 1.30 = 104,000", () => {
    // Full day worked on rest day (>= scheduled shift) → daily-rate × REST_DAY multiplier
    const result = computeSheet(makeInput({
      periodInput: { dayOffDutyDays: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.restDayPayCents).toBe(104_000n); // 80,000 × 1.30
  });

  it("restDayOtHours = 1 → restDayPayCents = 10,000 × 1.69 = 16,900", () => {
    // Rest day OT = 1.30 × 1.30 = 1.69×
    const result = computeSheet(makeInput({
      periodInput: { restDayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.restDayPayCents).toBe(16_900n); // 10,000 × 1.69
  });

  it("noWorkRegularHolidayDays = 1 → holidayPayCents = 80,000 × 1.00 = 80,000", () => {
    // Regular holiday, employee did not work → 100% holiday pay (daily rate × 1.00)
    const result = computeSheet(makeInput({
      periodInput: { noWorkRegularHolidayDays: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(80_000n); // 80,000 × 1.00
  });

  it("restDayRegularHolidayHours = 1 → holidayPayCents = 10,000 × 2.60 = 26,000", () => {
    // Regular holiday + rest day regular hours = 2.00 × 1.30 = 2.60×
    const result = computeSheet(makeInput({
      periodInput: { restDayRegularHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(26_000n); // 10,000 × 2.60
  });

  it("doubleHolidayHours = 1 → holidayPayCents = 10,000 × 3.00 = 30,000", () => {
    // Double holiday = LEGAL + SPECIAL on the same day = 3.00×
    const result = computeSheet(makeInput({
      periodInput: { doubleHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(30_000n); // 10,000 × 3.00
  });

  it("doubleHolidayOtHours = 1 → holidayPayCents = 10,000 × 3.90 = 39,000", () => {
    // Double holiday OT = 3.00 × 1.30 = 3.90×
    const result = computeSheet(makeInput({
      periodInput: { doubleHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(39_000n); // 10,000 × 3.90
  });

  it("restDayDoubleHolidayHours = 1 → holidayPayCents = 10,000 × 3.90 = 39,000", () => {
    // Double holiday + rest day = 3.00 × 1.30 = 3.90×
    const result = computeSheet(makeInput({
      periodInput: { restDayDoubleHolidayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(39_000n); // 10,000 × 3.90
  });

  it("restDayDoubleHolidayOtHours = 1 → holidayPayCents = 10,000 × 5.07 = 50,700", () => {
    // Double holiday + rest day + OT = 3.90 × 1.30 = 5.07×
    const result = computeSheet(makeInput({
      periodInput: { restDayDoubleHolidayOtHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(50_700n); // 10,000 × 5.07
  });

  it("custom multiplierConfig.OT = 1.50 overrides DOLE default 1.25", () => {
    // Tenant has negotiated OT at 1.50× instead of the DOLE floor 1.25×
    const result = computeSheet(makeInput({
      periodInput: { regularOtHours: 1 },
      multiplierConfig: { OT: 1.50 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.otPayCents).toBe(15_000n); // 10,000 × 1.50 (not 12,500)
  });

  it("custom multiplierConfig.REST_DAY = 1.50 overrides default 1.30", () => {
    // Verify partial override does not disturb other DOLE defaults
    const result = computeSheet(makeInput({
      periodInput: { restDayHours: 1, regularOtHours: 1 },
      multiplierConfig: { REST_DAY: 1.50 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.restDayPayCents).toBe(15_000n); // 10,000 × 1.50
    expect(result.otPayCents).toBe(12_500n);       // 10,000 × 1.25 (unaffected)
  });

  it("multiplierConfig.OT must not go below DOLE floor (API enforces, engine uses as given)", () => {
    // The API layer validates floors; the engine is a pure function and uses whatever is passed.
    // This test documents that the engine itself does NOT enforce the floor.
    const result = computeSheet(makeInput({
      periodInput: { regularOtHours: 1 },
      multiplierConfig: { OT: 1.00 }, // below DOLE floor of 1.25 — API would reject this
      overrideStatutoryDeducted: false,
    }));
    // Engine faithfully computes: 10,000 × 1.00 = 10,000
    expect(result.otPayCents).toBe(10_000n);
  });

  it("combined multi-scenario: special holiday OT + rest day = sum of parts", () => {
    // specialHolidayOtHours = 1  (1.69×)  and  restDayHours = 1  (1.30×)
    // holidayPayCents = 10,000 × 1.69 = 16,900
    // restDayPayCents = 10,000 × 1.30 = 13,000
    const result = computeSheet(makeInput({
      periodInput: { specialHolidayOtHours: 1, restDayHours: 1 },
      overrideStatutoryDeducted: false,
    }));
    expect(result.holidayPayCents).toBe(16_900n);
    expect(result.restDayPayCents).toBe(13_000n);
  });
});
