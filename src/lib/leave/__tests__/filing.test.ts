/**
 * leave filing tests — auto-LWOP split (Phase 4).
 */
import { describe, expect, it } from "vitest";
import { splitLeaveUnits } from "@/lib/leave/filing";

describe("splitLeaveUnits", () => {
  it("fully paid when balance covers the request", () => {
    expect(splitLeaveUnits(5, 3)).toEqual({ paidUnits: 3, unpaidUnits: 0 });
  });

  it("splits paid + LWOP when balance is partial (3 days, 1 available)", () => {
    expect(splitLeaveUnits(1, 3)).toEqual({ paidUnits: 1, unpaidUnits: 2 });
  });

  it("fully LWOP when no balance", () => {
    expect(splitLeaveUnits(0, 2)).toEqual({ paidUnits: 0, unpaidUnits: 2 });
  });

  it("clamps negative balance to zero paid (all LWOP)", () => {
    expect(splitLeaveUnits(-2, 2)).toEqual({ paidUnits: 0, unpaidUnits: 2 });
  });

  it("handles half-day amounts", () => {
    expect(splitLeaveUnits(0.5, 0.5)).toEqual({ paidUnits: 0.5, unpaidUnits: 0 });
    expect(splitLeaveUnits(0, 0.5)).toEqual({ paidUnits: 0, unpaidUnits: 0.5 });
  });
});
