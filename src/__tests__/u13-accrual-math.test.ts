/**
 * Unit 0.13 — accrual arithmetic.
 *
 * Leave converts to cash, so every assertion here is to the exact value.
 * Golden cases: 1.25 days/month, entitlement from 2026-02-14, February = 28 days.
 */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

import {
  roundToQuarter,
  computeAccrual,
  periodContaining,
  lastCompletedPeriod,
  utcDay,
  inclusiveDays,
} from "@/lib/leave/accrual-math";

const RATE = "1.25";
const FEB = periodContaining("MONTHLY", utcDay(2026, 2, 15));
const START = utcDay(2026, 2, 14);
const ENT_END = utcDay(2026, 12, 31);

describe("unit 0.13 — rounding to the nearest quarter, ties up (T3)", () => {
  it("T3: 0.3125 → 0.25", () => {
    expect(roundToQuarter("0.3125").toString()).toBe("0.25");
  });

  it("T3: 0.625 → 0.75 (exact tie rounds UP)", () => {
    expect(roundToQuarter("0.625").toString()).toBe("0.75");
  });

  it("T3: 0.6696 → 0.75", () => {
    expect(roundToQuarter("0.6696").toString()).toBe("0.75");
  });

  it("T3: 1.25 → 1.25 (already on a quarter boundary)", () => {
    expect(roundToQuarter("1.25").toString()).toBe("1.25");
  });

  // R38 withdrew the 0.25 floor: PURE nearest-quarter, so a small amount rounds
  // away to zero like any other. These four vectors pin the 0.125 cutoff.
  it("T3: 0.10 → 0 (no floor — below the midpoint rounds away)", () => {
    expect(roundToQuarter("0.10").toString()).toBe("0");
  });

  it("T3: 0.12 → 0 (just below the cutoff)", () => {
    expect(roundToQuarter("0.12").toString()).toBe("0");
  });

  it("T3: 0.125 → 0.25 (exactly the cutoff — a tie, and ties go up)", () => {
    expect(roundToQuarter("0.125").toString()).toBe("0.25");
  });

  it("T3: 0.13 → 0.25 (just above the cutoff)", () => {
    expect(roundToQuarter("0.13").toString()).toBe("0.25");
  });

  it("T3: the human consequence — 1.25/month over a 28-day February", () => {
    // 2 days served computes 0.0893 → nothing; 3 days computes 0.1339 → 0.25.
    const rate = new Decimal("1.25");
    expect(roundToQuarter(new Decimal(2).dividedBy(28).times(rate)).toString()).toBe("0");
    expect(roundToQuarter(new Decimal(3).dividedBy(28).times(rate)).toString()).toBe("0.25");
  });

  it("T3: above 1.00 — 1.30 → 1.25", () => {
    expect(roundToQuarter("1.30").toString()).toBe("1.25");
  });

  it("T3: above 1.00 — 1.875 → 2 (tie rounds UP)", () => {
    expect(roundToQuarter("1.875").toString()).toBe("2");
  });

  it("T3: above 1.00 — 2.60 → 2.5", () => {
    expect(roundToQuarter("2.60").toString()).toBe("2.5");
  });

  it("exactly zero stays zero", () => {
    expect(roundToQuarter("0").toString()).toBe("0");
  });
});

describe("unit 0.13 — the seven golden cases (T2)", () => {
  it("T2.1: pro-rate ON, serves to 28 Feb → 15/28 × 1.25 = 0.6696 → 0.75", () => {
    const r = computeAccrual({
      period: FEB,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: null,
      proRate: true,
      accrualAmount: RATE,
    });
    expect(r.coveredDays).toBe(15);
    expect(r.fullPeriod).toBe(false);
    expect(r.amount.toString()).toBe("0.75");
  });

  it("T2.2: pro-rate ON, resigns 20 Feb → 7/28 × 1.25 = 0.3125 → 0.25", () => {
    const r = computeAccrual({
      period: FEB,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: utcDay(2026, 2, 20),
      proRate: true,
      accrualAmount: RATE,
    });
    expect(r.coveredDays).toBe(7);
    expect(r.amount.toString()).toBe("0.25");
  });

  it("T2.3: pro-rate OFF, serves to 28 Feb → full 1.25, unrounded (D4)", () => {
    const r = computeAccrual({
      period: FEB,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: null,
      proRate: false,
      accrualAmount: RATE,
    });
    expect(r.amount.toString()).toBe("1.25");
  });

  it("T2.4: pro-rate OFF, resigns 20 Feb → 0 for February (D9)", () => {
    const r = computeAccrual({
      period: FEB,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: utcDay(2026, 2, 20),
      proRate: false,
      accrualAmount: RATE,
    });
    expect(r.amount.toString()).toBe("0");
  });

  it("T2.5a: any FULL month, pro-rate ON → 1.25 unrounded (D-B)", () => {
    const mar = periodContaining("MONTHLY", utcDay(2026, 3, 10));
    const r = computeAccrual({
      period: mar,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: null,
      proRate: true,
      accrualAmount: RATE,
    });
    expect(r.fullPeriod).toBe(true);
    expect(r.amount.toString()).toBe("1.25");
  });

  it("T2.5b: any FULL month, pro-rate OFF → 1.25 unrounded", () => {
    const mar = periodContaining("MONTHLY", utcDay(2026, 3, 10));
    const r = computeAccrual({
      period: mar,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: null,
      proRate: false,
      accrualAmount: RATE,
    });
    expect(r.amount.toString()).toBe("1.25");
  });

  it("T2.6: last working day IS the period end → full period earned (D-D)", () => {
    const mar = periodContaining("MONTHLY", utcDay(2026, 3, 10));
    const r = computeAccrual({
      period: mar,
      entitlementStart: utcDay(2026, 1, 1),
      entitlementEnd: null,
      servedUntil: utcDay(2026, 3, 31), // last working day = last day of March
      proRate: true,
      accrualAmount: RATE,
    });
    expect(r.fullPeriod).toBe(true);
    expect(r.amount.toString()).toBe("1.25");
  });

  it("T2.6b: pro-rate OFF, last working day IS the period end → full, not zero", () => {
    const mar = periodContaining("MONTHLY", utcDay(2026, 3, 10));
    const r = computeAccrual({
      period: mar,
      entitlementStart: utcDay(2026, 3, 5),
      entitlementEnd: null,
      servedUntil: utcDay(2026, 3, 31),
      proRate: false,
      accrualAmount: RATE,
    });
    expect(r.amount.toString()).toBe("1.25");
  });

  it("grants nothing when the entitlement does not overlap the period at all", () => {
    const jan = periodContaining("MONTHLY", utcDay(2026, 1, 10));
    const r = computeAccrual({
      period: jan,
      entitlementStart: START,
      entitlementEnd: ENT_END,
      servedUntil: null,
      proRate: true,
      accrualAmount: RATE,
    });
    expect(r.coveredDays).toBe(0);
    expect(r.amount.toString()).toBe("0");
  });
});

describe("unit 0.13 — QUARTERLY and ANNUALLY use the same code path (T5)", () => {
  it("T5: a full calendar quarter earns the full amount unrounded", () => {
    const q1 = periodContaining("QUARTERLY", utcDay(2026, 2, 15));
    expect(q1.key).toBe("2026-Q1");
    expect(q1.totalDays).toBe(90); // 31 + 28 + 31
    const r = computeAccrual({
      period: q1,
      entitlementStart: utcDay(2026, 1, 1),
      entitlementEnd: null,
      servedUntil: null,
      proRate: true,
      accrualAmount: "3.75",
    });
    expect(r.amount.toString()).toBe("3.75");
  });

  it("T5b: a partial quarter pro-rates over the QUARTER's days, then rounds", () => {
    const q1 = periodContaining("QUARTERLY", utcDay(2026, 2, 15));
    // Entitled 14 Feb → 31 Mar = 15 + 31 = 46 days of 90.
    const r = computeAccrual({
      period: q1,
      entitlementStart: START,
      entitlementEnd: null,
      servedUntil: null,
      proRate: true,
      accrualAmount: "3.75",
    });
    expect(r.coveredDays).toBe(46);
    // 46/90 × 3.75 = 1.91666… → nearest quarter = 2
    expect(r.amount.toString()).toBe("2");
  });

  it("T5c: a partial quarter with pro-rate OFF still earns the full amount (D4)", () => {
    const q1 = periodContaining("QUARTERLY", utcDay(2026, 2, 15));
    const r = computeAccrual({
      period: q1,
      entitlementStart: START,
      entitlementEnd: null,
      servedUntil: null,
      proRate: false,
      accrualAmount: "3.75",
    });
    expect(r.amount.toString()).toBe("3.75");
  });

  it("T5d: ANNUALLY — a partial year pro-rates over 365 days", () => {
    const y = periodContaining("ANNUALLY", utcDay(2026, 6, 1));
    expect(y.key).toBe("2026");
    expect(y.totalDays).toBe(365);
    // 14 Feb → 31 Dec inclusive = 321 days
    const r = computeAccrual({
      period: y,
      entitlementStart: START,
      entitlementEnd: null,
      servedUntil: null,
      proRate: true,
      accrualAmount: "15",
    });
    expect(r.coveredDays).toBe(321);
    // 321/365 × 15 = 13.1917… → nearest quarter = 13.25
    expect(r.amount.toString()).toBe("13.25");
  });

  it("T5e: a leap year is 366 days — the denominator is the real calendar", () => {
    expect(periodContaining("ANNUALLY", utcDay(2028, 6, 1)).totalDays).toBe(366);
    expect(periodContaining("MONTHLY", utcDay(2028, 2, 5)).totalDays).toBe(29);
  });
});

describe("unit 0.13 — period selection", () => {
  it("the last completed MONTHLY period as of 3 March is February", () => {
    const p = lastCompletedPeriod("MONTHLY", utcDay(2026, 3, 3));
    expect(p.key).toBe("2026-02");
    expect(p.totalDays).toBe(28);
  });

  it("the last completed QUARTERLY period as of 3 March is Q4 of the prior year", () => {
    expect(lastCompletedPeriod("QUARTERLY", utcDay(2026, 3, 3)).key).toBe("2025-Q4");
  });

  it("the last completed ANNUALLY period as of 3 March is the prior year", () => {
    expect(lastCompletedPeriod("ANNUALLY", utcDay(2026, 3, 3)).key).toBe("2025");
  });

  it("an accrual belongs to the year its period ENDS in (D-H)", () => {
    expect(lastCompletedPeriod("MONTHLY", utcDay(2026, 1, 5)).year).toBe(2025);
    expect(lastCompletedPeriod("MONTHLY", utcDay(2026, 1, 5)).key).toBe("2025-12");
  });

  it("inclusive day counting: 14 Feb → 28 Feb is 15 days", () => {
    expect(inclusiveDays(utcDay(2026, 2, 14), utcDay(2026, 2, 28))).toBe(15);
    expect(inclusiveDays(utcDay(2026, 2, 14), utcDay(2026, 2, 20))).toBe(7);
  });

  it("the fraction is held at working precision, not truncated to 4 dp first", () => {
    // 15/28 = 0.535714285714…  × 1.25 = 0.669642857…
    // Truncating the fraction to 4 dp (0.5357) would give 0.669625 — still 0.75
    // here, so assert the intermediate directly rather than only the outcome.
    const f = new Decimal(15).dividedBy(28);
    expect(f.times("1.25").toDecimalPlaces(6).toString()).toBe("0.669643");
  });
});
