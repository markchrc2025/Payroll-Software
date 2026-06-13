/**
 * §6 — Statutory Contributions Tests
 * §7 — Withholding Tax Tests
 *
 * Source: Engine_Test_Spec.md §6–§7
 *
 * All monetary values are BigInt centavos. Expected values are either:
 *   (a) Formula-derived — computed directly from rates/formulas in this file.
 *   (b) Worksheet-supplied — taken verbatim from the seeded statutory payload
 *       in scripts/load-statutory-2026.ts, hand-verified against official sources.
 *
 * Statutory payloads used as constants below are sourced from:
 *   - SSS: RA 11199 + SSS Circular 2025-006 (scripts/load-statutory-2026.ts)
 *   - PhilHealth: RA 11223 + PhilHealth Circular 2025-001
 *   - Pag-IBIG: RA 9679 + HDMF Circular No. 460
 *   - BIR: TRAIN RA 10963, RR No. 11-2018 (scripts/load-statutory-2026.ts)
 */
import { describe, expect, it } from "vitest";
import {
  computePagibig,
  computePhilHealth,
  computeSSS,
  lookupBIR,
} from "@/lib/statutory/compute";
import type {
  BirWithholdingPayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

// ---------------------------------------------------------------------------
// Statutory payloads — sourced from scripts/load-statutory-2026.ts
// These are the seeded values; expected test values below are derived from them.
// ---------------------------------------------------------------------------

/**
 * SSS 2026 — RA 11199 + SSS Circular 2025-006
 * Full contribution table: MSC ₱5,000–₱35,000 in ₱500 steps.
 * EC: ₱10 if MSC ≤ ₱14,750, else ₱30. MPF on excess MSC > ₱20,000 at 5%/10%.
 *
 * Generated from the same parameters as the official schedule; expected test
 * values below are derived from these same rates/thresholds.
 */
function buildSSSTable(): SssSchedulePayload {
  const MSC_FLOOR = 500_000;
  const MSC_CEILING = 3_500_000;
  const MSC_STEP = 50_000;
  const rows = [];
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

const SSS_2026: SssSchedulePayload = buildSSSTable();

/**
 * PhilHealth 2025+ — RA 11223 + PhilHealth Circular 2025-001
 * 5% rate; floor ₱10,000, ceiling ₱100,000; premium min ₱500 max ₱5,000; 50/50 split
 */
const PHIC_2025: PhilHealthSchedulePayload = {
  rate: 0.05,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};

/**
 * Pag-IBIG 2024 — RA 9679 + HDMF Circular No. 460 (eff. Feb 2024)
 * MFS cap ₱10,000; ≤₱1,500 EE 1%/ER 2%; >₱1,500 EE 2%/ER 2%
 */
const PAGIBIG_2024: PagibigSchedulePayload = {
  mfsCap: 1_000_000,
  brackets: [
    { upTo: 150_000, eeRate: 0.01, erRate: 0.02 },
    { upTo: null, eeRate: 0.02, erRate: 0.02 },
  ],
};

/**
 * BIR TRAIN 2023 — RA 10963, RR No. 11-2018
 * SEMI_MONTHLY and MONTHLY tables only (the frequencies used in PH payroll).
 * Source: scripts/load-statutory-2026.ts TRAIN_2023 constant.
 */
const BIR_TRAIN: BirWithholdingPayload = {
  frequencies: {
    SEMI_MONTHLY: [
      { floor: 0,          fixedTax: 0,         plusRate: 0    }, // ≤ ₱10,417
      { floor: 1_041_700,  fixedTax: 0,         plusRate: 0.15 }, // ₱10,417–₱16,666
      { floor: 1_666_700,  fixedTax: 93_750,    plusRate: 0.20 }, // ₱16,667–₱33,332
      { floor: 3_333_300,  fixedTax: 427_080,   plusRate: 0.25 }, // ₱33,333–₱83,332
      { floor: 8_333_300,  fixedTax: 1_677_080, plusRate: 0.30 }, // ₱83,333–₱333,332
      { floor: 33_333_300, fixedTax: 9_177_080, plusRate: 0.35 }, // ≥ ₱333,333
    ],
    MONTHLY: [
      { floor: 0,           fixedTax: 0,          plusRate: 0    }, // ≤ ₱20,833
      { floor: 2_083_300,   fixedTax: 0,          plusRate: 0.15 }, // ₱20,833–₱33,332
      { floor: 3_333_300,   fixedTax: 187_500,    plusRate: 0.20 }, // ₱33,333–₱66,666
      { floor: 6_666_700,   fixedTax: 854_170,    plusRate: 0.25 }, // ₱66,667–₱166,666
      { floor: 16_666_700,  fixedTax: 3_354_170,  plusRate: 0.30 }, // ₱166,667–₱666,666
      { floor: 66_666_700,  fixedTax: 18_354_170, plusRate: 0.35 }, // ≥ ₱666,667
    ],
  },
};

// ===========================================================================
// §6.1 — PhilHealth
// Formula-derived; exact. Rate 5%, floor ₱10,000, ceiling ₱100,000, 50/50 split.
// Expected: premium = rate × clamp(comp, floor, ceiling); EE = ER = premium / 2
// ===========================================================================
describe("§6.1 PhilHealth contributions", () => {
  it("below floor (₱8,000) → premium = ₱500 (floor applies)", () => {
    // comp = ₱8,000 < floor ₱10,000 → MSC clamped to ₱10,000
    // premium = 10,000 × 5% = ₱500; EE = ER = ₱250
    const r = computePhilHealth(PHIC_2025, 800_000n);
    expect(r.premium).toBe(50_000n);  // ₱500.00 — source: §6.1 row 1
    expect(r.employee).toBe(25_000n); // ₱250.00
    expect(r.employer).toBe(25_000n); // ₱250.00
    expect(r.employee + r.employer).toBe(r.premium); // EE+ER == premium invariant
  });

  it("at floor (₱10,000) → premium = ₱500", () => {
    // comp = ₱10,000, MSC = floor ₱10,000, premium = ₱500
    // Source: §6.1 row 2
    const r = computePhilHealth(PHIC_2025, 1_000_000n);
    expect(r.premium).toBe(50_000n);
    expect(r.employee).toBe(25_000n);
    expect(r.employer).toBe(25_000n);
  });

  it("at ₱30,000 → premium = ₱1,500, EE = ER = ₱750", () => {
    // comp = ₱30,000; premium = 30,000 × 5% = ₱1,500
    // Source: §6.1 row 3
    const r = computePhilHealth(PHIC_2025, 3_000_000n);
    expect(r.premium).toBe(150_000n);  // ₱1,500.00
    expect(r.employee).toBe(75_000n);  // ₱750.00
    expect(r.employer).toBe(75_000n);  // ₱750.00
  });

  it("at ceiling (₱100,000) → premium = ₱5,000, EE = ER = ₱2,500", () => {
    // Source: §6.1 row 4
    const r = computePhilHealth(PHIC_2025, 10_000_000n);
    expect(r.premium).toBe(500_000n);  // ₱5,000.00
    expect(r.employee).toBe(250_000n); // ₱2,500.00
    expect(r.employer).toBe(250_000n); // ₱2,500.00
  });

  it("above ceiling (₱150,000) → premium capped at ₱5,000", () => {
    // comp > ceiling → MSC clamped to ₱100,000 → same as at-ceiling
    // Source: §6.1 row 5
    const r = computePhilHealth(PHIC_2025, 15_000_000n);
    expect(r.premium).toBe(500_000n);
    expect(r.employee).toBe(250_000n);
    expect(r.employer).toBe(250_000n);
  });

  it("invariant: EE + ER == total premium for all cases", () => {
    const cases = [800_000n, 1_000_000n, 3_000_000n, 10_000_000n, 15_000_000n];
    for (const comp of cases) {
      const r = computePhilHealth(PHIC_2025, comp);
      expect(r.employee + r.employer).toBe(r.premium);
    }
  });
});

// ===========================================================================
// §6.2 — Pag-IBIG
// Formula-derived. MFS cap ₱10,000. ≤₱1,500: EE 1%, ER 2%. >₱1,500: EE 2%, ER 2%.
// ===========================================================================
describe("§6.2 Pag-IBIG contributions", () => {
  it("at ₱1,500 (1% threshold) → EE = ₱15, ER = ₱30", () => {
    // comp = ₱1,500; MFS = ₱1,500 (≤ cap); bracket: upTo=₱1,500 EE1%/ER2%
    // EE = 1,500 × 1% = ₱15; ER = 1,500 × 2% = ₱30
    // Source: §6.2 row 1
    const r = computePagibig(PAGIBIG_2024, 150_000n);
    expect(r.employee).toBe(1_500n);  // ₱15.00
    expect(r.employer).toBe(3_000n);  // ₱30.00
  });

  it("at ₱1,501 → EE = ₱30.02, ER = ₱30.02 (2% bracket)", () => {
    // comp = ₱1,501 > ₱1,500 threshold → 2% bracket
    // EE = 1,501 × 2% = ₱30.02; ER = 1,501 × 2% = ₱30.02
    // Source: §6.2 row 2
    const r = computePagibig(PAGIBIG_2024, 150_100n);
    expect(r.employee).toBe(3_002n);  // ₱30.02
    expect(r.employer).toBe(3_002n);  // ₱30.02
  });

  it("at ₱5,000 → EE = ₱100, ER = ₱100", () => {
    // comp = ₱5,000; MFS = ₱5,000; EE = ER = 5,000 × 2% = ₱100
    // Source: §6.2 row 3
    const r = computePagibig(PAGIBIG_2024, 500_000n);
    expect(r.employee).toBe(10_000n);  // ₱100.00
    expect(r.employer).toBe(10_000n);  // ₱100.00
  });

  it("at MFS cap (₱10,000) → EE = ₱200, ER = ₱200", () => {
    // comp = ₱10,000; MFS = cap ₱10,000; EE = ER = 10,000 × 2% = ₱200
    // Source: §6.2 row 4
    const r = computePagibig(PAGIBIG_2024, 1_000_000n);
    expect(r.employee).toBe(20_000n);  // ₱200.00
    expect(r.employer).toBe(20_000n);  // ₱200.00
  });

  it("above cap (₱30,000) → EE = ₱200, ER = ₱200 (capped at MFS ₱10,000)", () => {
    // comp = ₱30,000 > MFS cap → contribution computed on ₱10,000
    // Source: §6.2 row 5
    const r = computePagibig(PAGIBIG_2024, 3_000_000n);
    expect(r.employee).toBe(20_000n);  // ₱200.00
    expect(r.employer).toBe(20_000n);  // ₱200.00
  });
});

// ===========================================================================
// §6.3 — SSS
// Formula-derived for EE/ER at specific MSC points.
// EE = 5% × MSC; ER = 10% × MSC + EC; EC = ₱10 if MSC < ₱15,000 else ₱30.
// MPF applies on MSC above ₱20,000 at same 5%/10% split.
//
// Worksheet-supplied: MSC bracket assignment from load-statutory-2026.ts.
// The `deriveMsc` function steps compensation using floor ₱5,000, step ₱500.
// ===========================================================================
describe("§6.3 SSS contributions", () => {
  // --- EE = 5% × MSC, ER = 10% × MSC + EC ---

  it("MSC at floor ₱5,000 → EE = ₱250, ER = ₱510 (EC ₱10)", () => {
    // comp ≤ ₱5,000 → MSC = floor = ₱5,000
    // EE = 5,000 × 5% = ₱250; ER regular = 5,000 × 10% = ₱500; EC = ₱10 (MSC < ₱15,000)
    // Source: §6.3 formula + load-statutory-2026.ts SSS_2026 ec values
    const r = computeSSS(SSS_2026, 500_000n); // ₱5,000
    expect(r.msc).toBe(500_000n);     // ₱5,000
    expect(r.employee).toBe(25_000n); // ₱250.00
    expect(r.employer).toBe(50_000n); // ₱500.00 (no EC in employer field, EC is separate)
    expect(r.ec).toBe(1_000n);        // ₱10.00 — source: SSS_2026.ec.lowAmount
  });

  it("MSC at EC step ₱15,000 → EC = ₱30", () => {
    // comp around ₱15,000 → MSC = ₱15,000; EC flips to ₱30 (MSC > ₱14,750)
    // EE = 15,000 × 5% = ₱750; ER = 15,000 × 10% = ₱1,500; EC = ₱30
    // Source: §6.3 formula + load-statutory-2026.ts SSS_2026 ec.thresholdMsc
    const r = computeSSS(SSS_2026, 1_500_000n); // ₱15,000
    expect(r.msc).toBe(1_500_000n);
    expect(r.employee).toBe(75_000n);   // ₱750.00
    expect(r.employer).toBe(150_000n);  // ₱1,500.00
    expect(r.ec).toBe(3_000n);          // ₱30.00 — source: SSS_2026.ec.highAmount
  });

  it("at MPF boundary MSC = ₱20,000 → EE = ₱1,000, ER = ₱2,000, EC = ₱30", () => {
    // At threshold: no MPF (MPF applies on EXCESS over ₱20,000)
    // EE = 20,000 × 5% = ₱1,000; ER = 20,000 × 10% = ₱2,000; EC = ₱30
    // Source: §6.3 worksheet §1b MSC ₱20,000 row
    const r = computeSSS(SSS_2026, 2_000_000n); // ₱20,000
    expect(r.msc).toBe(2_000_000n);
    expect(r.employee).toBe(100_000n);  // ₱1,000.00
    expect(r.employer).toBe(200_000n);  // ₱2,000.00
    expect(r.ec).toBe(3_000n);          // ₱30.00
    expect(r.breakdown.eeMpf).toBe(0n); // no MPF at exactly ₱20,000
    expect(r.breakdown.erMpf).toBe(0n);
  });

  it("above MPF threshold MSC = ₱25,000 → EE = ₱1,250, ER = ₱2,500, EC = ₱30", () => {
    // MSC ₱25,000 > MPF threshold ₱20,000 → MPF on ₱5,000 excess
    // Regular: EE = 20,000 × 5% = ₱1,000; ER = 20,000 × 10% = ₱2,000
    // MPF: EE = 5,000 × 5% = ₱250; ER = 5,000 × 10% = ₱500
    // Total EE = ₱1,250; Total ER = ₱2,500; EC = ₱30
    // Source: §6.3 worksheet §1b MSC ₱25,000 row
    const r = computeSSS(SSS_2026, 2_500_000n); // ₱25,000
    expect(r.msc).toBe(2_500_000n);
    expect(r.employee).toBe(125_000n);          // ₱1,250.00
    expect(r.employer).toBe(250_000n);          // ₱2,500.00
    expect(r.ec).toBe(3_000n);                  // ₱30.00
    expect(r.breakdown.eeMpf).toBe(25_000n);    // ₱250.00
    expect(r.breakdown.erMpf).toBe(50_000n);    // ₱500.00
  });

  it("at ceiling MSC = ₱35,000 → EE = ₱1,750, ER = ₱3,500, EC = ₱30", () => {
    // Comp ≥ ceiling ₱35,000 → MSC capped at ₱35,000
    // Regular base: ₱20,000; MPF base: ₱15,000
    // EE = (20,000 + 15,000) × 5% = ₱1,750; ER = same × 10% = ₱3,500; EC = ₱30
    // Source: §6.3 worksheet §1b ceiling row
    const r = computeSSS(SSS_2026, 3_500_000n); // ₱35,000
    expect(r.msc).toBe(3_500_000n);
    expect(r.employee).toBe(175_000n);           // ₱1,750.00
    expect(r.employer).toBe(350_000n);           // ₱3,500.00
    expect(r.ec).toBe(3_000n);
  });

  it("above ceiling (₱50,000) → MSC still capped at ₱35,000", () => {
    const r = computeSSS(SSS_2026, 5_000_000n);
    expect(r.msc).toBe(3_500_000n);
    expect(r.employee).toBe(175_000n);
  });

  it("invariant: EE + ER totals reconcile to 15% × MSC + EC", () => {
    // For MSC ≤ ₱20,000 (no MPF): total = 15% × MSC + EC
    const r = computeSSS(SSS_2026, 1_500_000n); // MSC = ₱15,000
    const expected = BigInt(Math.round(Number(r.msc) * 0.15)) + r.ec;
    expect(r.employee + r.employer + r.ec).toBe(expected);
  });
});

// ===========================================================================
// §6.3 — SSS compensation-to-MSC table lookup
// The contribution table maps each compensation band to an MSC.
// These verify the table lookup finds the correct row.
// ===========================================================================
describe("§6.3 SSS MSC table lookup (row-based)", () => {
  it("₱4,999 → MSC = ₱5,000 (first row: comp ≤ ₱5,249.99)", () => {
    const r = computeSSS(SSS_2026, 499_900n);
    expect(r.msc).toBe(500_000n);
  });

  it("₱5,250 → MSC = ₱5,500 (second row: ₱5,250–₱5,749.99)", () => {
    const r = computeSSS(SSS_2026, 525_000n);
    expect(r.msc).toBe(550_000n);
  });

  it("₱20,000 → MSC = ₱20,000 (exact band boundary)", () => {
    const r = computeSSS(SSS_2026, 2_000_000n);
    expect(r.msc).toBe(2_000_000n);
  });

  it("₱35,000 → MSC = ₱35,000 (ceiling row)", () => {
    const r = computeSSS(SSS_2026, 3_500_000n);
    expect(r.msc).toBe(3_500_000n);
  });
});

// ===========================================================================
// §6.4 — Cutoff timing
// SEMI_MONTHLY with SECOND_CUTOFF: statutory deducted only on 2nd cutoff (day ≥ 16).
// Source: Engine_Test_Spec.md §6.4 + engine.ts isStatutoryDeducted()
// ===========================================================================
describe("§6.4 Statutory cutoff timing", () => {
  // Import isStatutoryDeducted for direct testing
  it("MONTHLY cycle always deducts", async () => {
    const { isStatutoryDeducted } = await import("@/lib/payroll/engine");
    expect(isStatutoryDeducted("MONTHLY", "SECOND_CUTOFF", new Date("2026-01-31"))).toBe(true);
    expect(isStatutoryDeducted("MONTHLY", "FIRST_CUTOFF",  new Date("2026-01-15"))).toBe(true);
  });

  it("SEMI_MONTHLY + SECOND_CUTOFF: period ending day 15 → NOT deducted", async () => {
    const { isStatutoryDeducted } = await import("@/lib/payroll/engine");
    // Source: §6.4 — ₱0 on first cutoff
    expect(isStatutoryDeducted("SEMI_MONTHLY", "SECOND_CUTOFF", new Date("2026-01-15"))).toBe(false);
  });

  it("SEMI_MONTHLY + SECOND_CUTOFF: period ending day 31 → IS deducted", async () => {
    const { isStatutoryDeducted } = await import("@/lib/payroll/engine");
    // Source: §6.4 — full monthly contribution on second cutoff
    expect(isStatutoryDeducted("SEMI_MONTHLY", "SECOND_CUTOFF", new Date("2026-01-31"))).toBe(true);
  });

  it("SEMI_MONTHLY + FIRST_CUTOFF: period ending day 15 → IS deducted", async () => {
    const { isStatutoryDeducted } = await import("@/lib/payroll/engine");
    expect(isStatutoryDeducted("SEMI_MONTHLY", "FIRST_CUTOFF", new Date("2026-01-15"))).toBe(true);
  });

  it("SEMI_MONTHLY + FIRST_CUTOFF: period ending day 31 → NOT deducted", async () => {
    const { isStatutoryDeducted } = await import("@/lib/payroll/engine");
    expect(isStatutoryDeducted("SEMI_MONTHLY", "FIRST_CUTOFF", new Date("2026-01-31"))).toBe(false);
  });
});

// ===========================================================================
// §7 — BIR Withholding Tax
// Structure formula-derived; bracket fixed-tax values are worksheet-supplied
// (sourced verbatim from load-statutory-2026.ts TRAIN_2023 constant).
//
// Formula: tax = fixedTax + (taxable − bracketFloor) × plusRate
// ===========================================================================
describe("§7 BIR Withholding Tax — SEMI_MONTHLY table", () => {
  it("₱0 taxable → ₱0 withholding (zero bracket)", () => {
    const r = lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 0n);
    expect(r.tax).toBe(0n);
  });

  it("at exemption threshold ₱10,417 → ₱0 (still bracket 0)", () => {
    // Bracket 0: floor 0, fixedTax 0, plusRate 0 — covers ≤ ₱10,417
    // Source: TRAIN_2023 SEMI_MONTHLY bracket 0
    const r = lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 1_041_700n); // exactly ₱10,417
    expect(r.tax).toBe(0n);
  });

  it("₱12,000 → bracket 15% (₱10,418–₱16,666)", () => {
    // taxable = ₱12,000; bracket floor = ₱10,417; fixedTax = ₱0; plusRate = 15%
    // tax = 0 + (12,000 − 10,417) × 0.15 = 1,583 × 0.15 = 237.45 → round = ₱237
    // Source: TRAIN_2023 SEMI_MONTHLY bracket 1 (worksheet-supplied floor 1_041_700)
    const r = lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 1_200_000n); // ₱12,000
    const expectedTax = BigInt(Math.round((1_200_000 - 1_041_700) * 0.15)); // 158300 * 0.15 = 23745 → 23745
    expect(r.tax).toBe(expectedTax);
    expect(r.bracket.plusRate).toBe(0.15);
  });

  it("₱20,000 → bracket 20% (₱16,667–₱33,332)", () => {
    // taxable = ₱20,000; floor = ₱16,667; fixedTax = ₱93,750 centavos; plusRate = 20%
    // tax = 93,750 + (20,000 − 16,667) × 20% = 93,750 + (333,300 × 0.20) = 93,750 + 66,660 = 160,410
    // Source: TRAIN_2023 SEMI_MONTHLY bracket 2 (worksheet-supplied fixedTax 93_750)
    const r = lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 2_000_000n); // ₱20,000
    const floor = 1_666_700n;
    const fixed = 93_750n;
    const excess = 2_000_000n - floor;
    const variable = BigInt(Math.round(Number(excess) * 0.20));
    const expected = fixed + variable;
    expect(r.tax).toBe(expected);
    expect(r.bracket.plusRate).toBe(0.20);
  });

  it("₱40,000 → bracket 25% (₱33,333–₱83,332)", () => {
    // floor = ₱33,333; fixedTax = ₱427,080; plusRate = 25%
    // Source: TRAIN_2023 SEMI_MONTHLY bracket 3 (worksheet-supplied fixedTax 427_080)
    const r = lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 4_000_000n); // ₱40,000
    const floor = 3_333_300n;
    const fixed = 427_080n;
    const excess = 4_000_000n - floor;
    const variable = BigInt(Math.round(Number(excess) * 0.25));
    expect(r.tax).toBe(fixed + variable);
    expect(r.bracket.plusRate).toBe(0.25);
  });
});

describe("§7 BIR Withholding Tax — MONTHLY table", () => {
  it("₱0 → ₱0 tax", () => {
    expect(lookupBIR(BIR_TRAIN, "MONTHLY", 0n).tax).toBe(0n);
  });

  it("at monthly exemption threshold ₱20,833 → ₱0 tax", () => {
    // Source: TRAIN_2023 MONTHLY bracket 0 floor=0 (covers ≤ ₱20,833)
    const r = lookupBIR(BIR_TRAIN, "MONTHLY", 2_083_300n); // ₱20,833
    expect(r.tax).toBe(0n);
  });

  it("₱25,000 → bracket 15%", () => {
    // floor = ₱20,833; fixedTax = ₱0; plusRate = 15%
    // tax = (25,000 − 20,833) × 15% = 4,167 × 0.15 = 625.05 → 625
    // Source: TRAIN_2023 MONTHLY bracket 1 (worksheet-supplied floor 2_083_300)
    const r = lookupBIR(BIR_TRAIN, "MONTHLY", 2_500_000n); // ₱25,000
    const excess = 2_500_000n - 2_083_300n;
    const expected = BigInt(Math.round(Number(excess) * 0.15));
    expect(r.tax).toBe(expected);
  });
});

describe("§7 BIR effective-dating structure", () => {
  it("throws when pay frequency has no matching table", () => {
    // WEEKLY not present in our test payload (SEMI_MONTHLY required by type)
    const partialPayload: BirWithholdingPayload = {
      frequencies: {
        SEMI_MONTHLY: BIR_TRAIN.frequencies.SEMI_MONTHLY,
        MONTHLY: BIR_TRAIN.frequencies.MONTHLY,
      },
    };
    expect(() => lookupBIR(partialPayload, "WEEKLY", 1_000_000n)).toThrow();
  });

  it("income at or below exemption threshold yields ₱0 for all frequencies", () => {
    expect(lookupBIR(BIR_TRAIN, "MONTHLY",     0n).tax).toBe(0n);
    expect(lookupBIR(BIR_TRAIN, "SEMI_MONTHLY", 0n).tax).toBe(0n);
  });
});
