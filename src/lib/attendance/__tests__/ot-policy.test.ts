/**
 * ot-policy tests — per-shift OT break-deduction rule (Phase 2).
 */
import { describe, expect, it } from "vitest";
import { applyOtBreakRule, type OtPolicyShift } from "@/lib/attendance/ot-policy";

const NONE: OtPolicyShift = {
  otBreakMode: "NONE",
  otBreakTriggerHours: null,
  otBreakBlockHours: null,
  otBreakMinutes: null,
};

describe("applyOtBreakRule", () => {
  it("NONE returns raw OT unchanged", () => {
    expect(applyOtBreakRule(540, NONE)).toBe(540);
  });

  it("SINGLE deducts once when OT meets the trigger (9h → 8h)", () => {
    const shift: OtPolicyShift = {
      otBreakMode: "SINGLE",
      otBreakTriggerHours: 6,
      otBreakBlockHours: null,
      otBreakMinutes: 60,
    };
    expect(applyOtBreakRule(540, shift)).toBe(480); // 9h → 8h
  });

  it("SINGLE does not deduct below the trigger (5h → 5h)", () => {
    const shift: OtPolicyShift = {
      otBreakMode: "SINGLE",
      otBreakTriggerHours: 6,
      otBreakBlockHours: null,
      otBreakMinutes: 60,
    };
    expect(applyOtBreakRule(300, shift)).toBe(300);
  });

  it("TIERED deducts per block (9h, 4h block → −2h → 7h)", () => {
    const shift: OtPolicyShift = {
      otBreakMode: "TIERED",
      otBreakTriggerHours: null,
      otBreakBlockHours: 4,
      otBreakMinutes: 60,
    };
    expect(applyOtBreakRule(540, shift)).toBe(420); // floor(9/4)=2 blocks → −120
  });

  it("accepts Decimal-like (toString) values for hours", () => {
    const shift: OtPolicyShift = {
      otBreakMode: "SINGLE",
      otBreakTriggerHours: { toString: () => "6.00" },
      otBreakBlockHours: null,
      otBreakMinutes: 60,
    };
    expect(applyOtBreakRule(540, shift)).toBe(480);
  });

  it("never returns negative and clamps zero break", () => {
    const shift: OtPolicyShift = {
      otBreakMode: "SINGLE",
      otBreakTriggerHours: 1,
      otBreakBlockHours: null,
      otBreakMinutes: 0,
    };
    expect(applyOtBreakRule(120, shift)).toBe(120); // 0 break → no change
  });
});
