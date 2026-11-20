/**
 * PAY-65 (plan 1.10, R69: "statutory payload single source of truth: three
 * hand-transcribed SSS tables, seed script not importable").
 *
 * The 2026 statutory baseline: the payloads Sentire loads as the global
 * statutory rules. This is the one place they are written down. The loader
 * (scripts/load-statutory-2026.ts) writes these to the database, and tests
 * that need the real tables import them from here instead of copying them.
 *
 * Pure data: no database access, nothing runs on import.
 */
import type {
  BirWithholdingPayload,
  DeMinimisCeilingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "./types";

// ---------------------------------------------------------------------------
// Date markers
// ---------------------------------------------------------------------------
export const SSS_2026_FROM = new Date("2026-01-01T00:00:00.000Z");
export const PHIC_2025_FROM = new Date("2025-01-01T00:00:00.000Z"); // ceiling 100k effective 2025
export const PAGIBIG_2024_FROM = new Date("2024-02-01T00:00:00.000Z"); // Circular 460
export const TRAIN_2023_FROM = new Date("2023-01-01T00:00:00.000Z");
export const RR29_2025_FROM = new Date("2025-01-01T00:00:00.000Z");
// MINIMUM_WAGE_RATE row carries multiple regions; effectiveFrom = earliest
// wage order across regions covered (Wage Order IVA-22 eff. 2025-07-01).
export const MIN_WAGE_2025_FROM = new Date("2025-07-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// SSS 2026 (RA 11199 + SSS Circular 2025-006)
//   Full contribution table: MSC ₱5,000–₱35,000 in ₱500 steps.
//   Rates: EE 5%, ER 10% on regular SS (up to MSC ₱20,000) and MPF (excess).
//   EC (ER-only): ₱10 if MSC ≤ ₱14,750, else ₱30.
// ---------------------------------------------------------------------------
export function buildSSS2026(): SssSchedulePayload {
  const MSC_FLOOR = 500_000;
  const MSC_CEILING = 3_500_000;
  const MSC_STEP = 50_000;
  const rows: SssSchedulePayload["rows"] = [];
  for (let msc = MSC_FLOOR; msc <= MSC_CEILING; msc += MSC_STEP) {
    const n = (msc - MSC_FLOOR) / MSC_STEP;
    const isLast = msc === MSC_CEILING;
    const compFrom = n === 0 ? 0 : 475_000 + n * MSC_STEP;
    const compTo = isLast ? 99_999_999 : MSC_FLOOR + n * MSC_STEP + MSC_STEP / 2 - 1;
    const regularBase = Math.min(msc, 2_000_000);
    const mpfBase = Math.max(0, msc - 2_000_000);
    const regularSSEmployer = Math.round(regularBase * 0.10);
    const regularSSEmployee = Math.round(regularBase * 0.05);
    const ecEmployer = msc > 1_475_000 ? 3_000 : 1_000;
    const mpfEmployer = Math.round(mpfBase * 0.10);
    const mpfEmployee = Math.round(mpfBase * 0.05);
    rows.push({
      compensationFrom: compFrom, compensationTo: compTo, msc,
      regularSSEmployer, regularSSEmployee, regularSSTotal: regularSSEmployer + regularSSEmployee,
      ecEmployer, mpfEmployer, mpfEmployee, mpfTotal: mpfEmployer + mpfEmployee,
      totalEmployer: regularSSEmployer + ecEmployer + mpfEmployer,
      totalEmployee: regularSSEmployee + mpfEmployee,
      totalTotal: regularSSEmployer + ecEmployer + mpfEmployer + regularSSEmployee + mpfEmployee,
    });
  }
  return { rows };
}
export const SSS_2026: SssSchedulePayload = buildSSS2026();

// ---------------------------------------------------------------------------
// PhilHealth 2025+ (RA 11223 + PhilHealth Circular 2025-001)
//   • 5% rate (capped final schedule per UHC Act)
//   • Salary floor ₱10,000; ceiling ₱100,000
//   • Premium min ₱500, max ₱5,000
//   • 50/50 EE/ER split
// ---------------------------------------------------------------------------
export const PHIC_2025: PhilHealthSchedulePayload = {
  rate: 0.05,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};

// ---------------------------------------------------------------------------
// Pag-IBIG (RA 9679 + HDMF Circular No. 460, effective Feb 2024)
//   • MFS cap raised to ₱10,000 (was ₱5,000)
//   • MFS ≤ ₱1,500 → EE 1%, ER 2%
//   • MFS > ₱1,500 → EE 2%, ER 2%
// ---------------------------------------------------------------------------
export const PAGIBIG_2024: PagibigSchedulePayload = {
  mfsCap: 1_000_000, // ₱10,000
  brackets: [
    { upTo: 150_000, eeRate: 0.01, erRate: 0.02 }, // ≤ ₱1,500
    { upTo: null, eeRate: 0.02, erRate: 0.02 }, // > ₱1,500, capped by mfsCap
  ],
};

// ---------------------------------------------------------------------------
// BIR Withholding (TRAIN, RA 10963, effective 2023-01-01 onward).
//
// Source: BIR Revised Withholding Tax Table (RR No. 11-2018 as amended by
// RR 8-2018; tables transition to "2023-onward" rates per §24(A)(2)(b)).
// Values below are the OFFICIAL BIR-published rounded amounts (centavos).
// ---------------------------------------------------------------------------
export const TRAIN_2023: BirWithholdingPayload = {
  frequencies: {
    DAILY: [
      { floor: 0, fixedTax: 0, plusRate: 0 }, // ≤ ₱685
      { floor: 68_500, fixedTax: 0, plusRate: 0.15 }, // ₱685 – ₱1,095
      { floor: 109_600, fixedTax: 6_165, plusRate: 0.20 }, // ₱1,096 – ₱2,191
      { floor: 219_200, fixedTax: 28_085, plusRate: 0.25 }, // ₱2,192 – ₱5,478
      { floor: 547_900, fixedTax: 110_260, plusRate: 0.30 }, // ₱5,479 – ₱21,917
      { floor: 2_191_800, fixedTax: 603_430, plusRate: 0.35 }, // ≥ ₱21,918
    ],
    WEEKLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 }, // ≤ ₱4,808
      { floor: 480_800, fixedTax: 0, plusRate: 0.15 },
      { floor: 769_300, fixedTax: 43_270, plusRate: 0.20 },
      { floor: 1_538_500, fixedTax: 197_120, plusRate: 0.25 },
      { floor: 3_846_200, fixedTax: 774_050, plusRate: 0.30 },
      { floor: 15_384_700, fixedTax: 4_235_600, plusRate: 0.35 },
    ],
    SEMI_MONTHLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 }, // ≤ ₱10,417
      { floor: 1_041_700, fixedTax: 0, plusRate: 0.15 }, // ₱10,417 – ₱16,666
      { floor: 1_666_700, fixedTax: 93_750, plusRate: 0.20 }, // ₱16,667 – ₱33,332
      { floor: 3_333_300, fixedTax: 427_080, plusRate: 0.25 }, // ₱33,333 – ₱83,332
      { floor: 8_333_300, fixedTax: 1_677_080, plusRate: 0.30 }, // ₱83,333 – ₱333,332
      { floor: 33_333_300, fixedTax: 9_177_080, plusRate: 0.35 }, // ≥ ₱333,333
    ],
    MONTHLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 }, // ≤ ₱20,833
      { floor: 2_083_300, fixedTax: 0, plusRate: 0.15 }, // ₱20,833 – ₱33,332
      { floor: 3_333_300, fixedTax: 187_500, plusRate: 0.20 }, // ₱33,333 – ₱66,666
      { floor: 6_666_700, fixedTax: 854_170, plusRate: 0.25 }, // ₱66,667 – ₱166,666
      { floor: 16_666_700, fixedTax: 3_354_170, plusRate: 0.30 }, // ₱166,667 – ₱666,666
      { floor: 66_666_700, fixedTax: 18_354_170, plusRate: 0.35 }, // ≥ ₱666,667
    ],
  },
};

// ---------------------------------------------------------------------------
// De Minimis Ceilings — RR No. 29-2025 (effective CY 2025 onward).
// Subset of items most commonly used in PH payroll; can be extended.
// ---------------------------------------------------------------------------
export const DE_MINIMIS_2025: DeMinimisCeilingPayload = {
  items: [
    {
      code: "RICE_SUBSIDY",
      label: "Rice subsidy",
      monthlyCeiling: 250_000, // ₱2,500 / month (RR 29-2025)
      annualCeiling: 3_000_000,
      basis: "RR 29-2025 §2",
    },
    {
      code: "UNIFORM_ALLOWANCE",
      label: "Uniform & clothing allowance",
      monthlyCeiling: null,
      annualCeiling: 700_000, // ₱7,000 / year
      basis: "RR 29-2025 §2",
    },
    {
      code: "MEDICAL_ASSISTANCE_DEPENDENT",
      label: "Medical assistance to employee's dependents",
      monthlyCeiling: null,
      annualCeiling: 150_000, // ₱1,500 / year
      basis: "RR 29-2025 §2",
    },
    {
      code: "MEDICAL_ALLOWANCE_EMPLOYEE",
      label: "Annual medical/healthcare allowance",
      monthlyCeiling: null,
      annualCeiling: 1_000_000, // ₱10,000 / year
      basis: "RR 29-2025 §2",
    },
    {
      code: "ACHIEVEMENT_AWARD",
      label: "Employee achievement award (tangible)",
      monthlyCeiling: null,
      annualCeiling: 1_000_000, // ₱10,000 / year
      basis: "RR 29-2025 §2",
    },
    {
      code: "GIFTS_CHRISTMAS",
      label: "Christmas / anniversary gifts",
      monthlyCeiling: null,
      annualCeiling: 500_000, // ₱5,000 / year
      basis: "RR 29-2025 §2",
    },
    {
      code: "LAUNDRY_ALLOWANCE",
      label: "Laundry allowance",
      monthlyCeiling: 30_000, // ₱300 / month
      annualCeiling: 360_000,
      basis: "RR 29-2025 §2",
    },
    {
      code: "MEAL_OVERTIME",
      label: "Meal benefit during overtime (capped at 25% of basic minimum wage)",
      monthlyCeiling: null,
      annualCeiling: null,
      basis: "RR 29-2025 §2 / RR 5-2011",
    },
    {
      code: "PRODUCTIVITY_INCENTIVE",
      label: "Productivity incentive scheme (CBA / collective)",
      monthlyCeiling: null,
      annualCeiling: 1_000_000, // ₱10,000 / year aggregate
      basis: "RR 29-2025 §2",
    },
  ],
};

// ---------------------------------------------------------------------------
// Minimum Wage — RTWPB Wage Orders (NCR + Region IV-A, 2025 effectivity).
// ---------------------------------------------------------------------------
export const MIN_WAGE_2025: MinimumWagePayload = {
  regions: {
    NCR: {
      label: "National Capital Region",
      dailyRate: 64_500, // ₱645 / day (Wage Order NCR-26, eff. 2025-07-17)
      basis: "Wage Order No. NCR-26",
    },
    REGION_IV_A: {
      label: "CALABARZON (Region IV-A)",
      // Standard rate for non-agriculture / non-retail-service ≤ 10 workers
      // tier varies by area. We use the highest tier (Wage Order IVA-22).
      dailyRate: 56_000, // ₱560 / day
      basis: "Wage Order No. IVA-22",
    },
  },
};
