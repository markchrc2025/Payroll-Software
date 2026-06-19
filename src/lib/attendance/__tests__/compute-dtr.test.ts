/**
 * compute-dtr tests — Phase 1: flexible core window + break-policy enforcement.
 *
 * Punch times are constructed in UTC against a fixed calendar date so the
 * assertions match the UTC-midnight convention used by computeDtrFields.
 */
import { describe, expect, it } from "vitest";
import {
  computeDtrFields,
  type AttendancePunch,
  type ShiftContext,
} from "@/lib/attendance/compute-dtr";

const DATE = new Date("2026-06-15T00:00:00.000Z");

/** Build an IN/OUT punch at the given UTC hour:minute on DATE. */
function punch(type: "IN" | "OUT", h: number, m = 0): AttendancePunch {
  const d = new Date(DATE);
  d.setUTCHours(h, m, 0, 0);
  return { punchType: type, punchedAt: d };
}

/** Base FIXED shift 08:00→17:00, 60-min fixed-deduction break. */
function fixedShift(overrides: Partial<ShiftContext> = {}): ShiftContext {
  return {
    timeIn: "08:00",
    timeOut: "17:00",
    coreTimeIn: null,
    coreTimeOut: null,
    requiredHours: null,
    breakMinutes: 60,
    crossesMidnight: false,
    breakPolicy: "FIXED_DEDUCTION",
    gracePeriodMinutes: 0,
    otThresholdMinutes: null,
    ...overrides,
  };
}

/** Base FLEXIBLE shift: 8 required hours, no fixed start/end. */
function flexShift(overrides: Partial<ShiftContext> = {}): ShiftContext {
  return {
    timeIn: null,
    timeOut: null,
    coreTimeIn: null,
    coreTimeOut: null,
    requiredHours: 8,
    breakMinutes: 60,
    crossesMidnight: false,
    breakPolicy: "FIXED_DEDUCTION",
    gracePeriodMinutes: 0,
    otThresholdMinutes: null,
    ...overrides,
  };
}

describe("computeDtrFields — break policies", () => {
  const inOut = [punch("IN", 8), punch("OUT", 17)]; // 9-hour span

  it("FIXED_DEDUCTION deducts the fixed break", () => {
    const r = computeDtrFields(DATE, inOut, fixedShift({ breakPolicy: "FIXED_DEDUCTION" }));
    expect(r.workedMinutes).toBe(540 - 60); // 480
  });

  it("FLOATING deducts the fixed break (same as fixed-deduction)", () => {
    const r = computeDtrFields(DATE, inOut, fixedShift({ breakPolicy: "FLOATING" }));
    expect(r.workedMinutes).toBe(480);
  });

  it("PAID_BREAK does not deduct the break", () => {
    const r = computeDtrFields(DATE, inOut, fixedShift({ breakPolicy: "PAID_BREAK" }));
    expect(r.workedMinutes).toBe(540);
  });

  it("PUNCH_IN_OUT sums only paired IN-OUT intervals (break excluded)", () => {
    const punches = [
      punch("IN", 8),
      punch("OUT", 12), // 4h
      punch("IN", 13), // 1h break clocked out
      punch("OUT", 17), // 4h
    ];
    const r = computeDtrFields(DATE, punches, fixedShift({ breakPolicy: "PUNCH_IN_OUT" }));
    expect(r.workedMinutes).toBe(480); // 8h worked, 1h break not counted
  });

  it("TRACK_ACTUAL behaves like punch-in-out", () => {
    const punches = [punch("IN", 8), punch("OUT", 12), punch("IN", 13), punch("OUT", 17)];
    const r = computeDtrFields(DATE, punches, fixedShift({ breakPolicy: "TRACK_ACTUAL" }));
    expect(r.workedMinutes).toBe(480);
  });
});

describe("computeDtrFields — NSD window", () => {
  it("defaults to the 22:00–06:00 window", () => {
    // Work 22:00 → 02:00 next day (crosses midnight) = 4h all within NSD.
    const punches = [punch("IN", 22), { punchType: "OUT" as const, punchedAt: new Date("2026-06-16T02:00:00.000Z") }];
    const r = computeDtrFields(DATE, punches, null);
    expect(r.nsdMinutes).toBe(240);
  });

  it("respects a custom window (21:00–05:00)", () => {
    // Work 20:00 → 23:00. Default window: 22–23 = 60m. Custom 21:00 start: 21–23 = 120m.
    const punches = [punch("IN", 20), punch("OUT", 23)];
    const def = computeDtrFields(DATE, punches, null);
    expect(def.nsdMinutes).toBe(60);
    const custom = computeDtrFields(DATE, punches, null, { startMin: 21 * 60, endMin: 5 * 60 });
    expect(custom.nsdMinutes).toBe(120);
  });
});

describe("computeDtrFields — flexible core window", () => {
  it("records late when arriving after coreTimeIn (+ grace)", () => {
    // core 09:00–15:00, arrives 09:30 → 30 min late
    const punches = [punch("IN", 9, 30), punch("OUT", 18)];
    const r = computeDtrFields(
      DATE,
      punches,
      flexShift({ coreTimeIn: "09:00", coreTimeOut: "15:00" }),
    );
    expect(r.lateMinutes).toBe(30);
  });

  it("applies grace period to the core start", () => {
    const punches = [punch("IN", 9, 10), punch("OUT", 18)];
    const r = computeDtrFields(
      DATE,
      punches,
      flexShift({ coreTimeIn: "09:00", coreTimeOut: "15:00", gracePeriodMinutes: 15 }),
    );
    expect(r.lateMinutes).toBe(0); // within grace
  });

  it("no late when there is no core start (pure flexible)", () => {
    const punches = [punch("IN", 11), punch("OUT", 20)];
    const r = computeDtrFields(DATE, punches, flexShift());
    expect(r.lateMinutes).toBe(0);
  });

  it("undertime is the larger of required-hours shortfall and leaving before core end", () => {
    // worked 08:00–14:00 = 6h span − 1h break = 5h (300m); required 8h → 180m short
    // core end 15:00, left 14:00 → 60m core-undertime; max = 180m
    const punches = [punch("IN", 8), punch("OUT", 14)];
    const r = computeDtrFields(
      DATE,
      punches,
      flexShift({ coreTimeIn: "09:00", coreTimeOut: "15:00" }),
    );
    expect(r.undertimeMinutes).toBe(180);
  });

  it("core-end undertime applies even when required hours are met", () => {
    // worked 06:00–14:00 = 8h span − 1h break = 7h (420m) < 8h required → 60m short
    // core end 15:00, left 14:00 → 60m core-undertime; max = 60m
    const punches = [punch("IN", 6), punch("OUT", 14)];
    const r = computeDtrFields(
      DATE,
      punches,
      flexShift({ coreTimeIn: "07:00", coreTimeOut: "15:00" }),
    );
    expect(r.undertimeMinutes).toBe(60);
  });
});
