/**
 * PAY-185 (ESS sandbox test, 18 Nov 2026): a day clocked in at 00:47 and out
 * at 00:48 on an 08:00 to 17:00 shift recorded 971 minutes of undertime, so
 * one day docked about two days' pay (₱2,790.17 on a ₱24,482.76 monthly).
 *
 *   U1  (T1) late plus undertime never exceed the day's scheduled working
 *       minutes (span less the break: 480 here).
 *   U2  ordinary days are unchanged: leaving at 16:30 is 30 minutes; late 15
 *       and out at 17:00 is 15 late and no undertime.
 */
import { describe, expect, it } from "vitest";
import { computeDtrFields } from "@/lib/attendance/compute-dtr";

const shift = {
  timeIn: "08:00", timeOut: "17:00", coreTimeIn: null, coreTimeOut: null, requiredHours: null,
  gracePeriodMinutes: 0, breakMinutes: 60, breakPolicy: "FIXED_DEDUCTION" as const, crossesMidnight: false,
  otThresholdMinutes: null, breakDeductAfterMinutes: 300,
};
const nsd = { startMin: 22 * 60, endMin: 6 * 60 };
const mnl = (hm: string) => new Date(`2026-11-18T${hm}:00+08:00`);
const day = (i: string, o: string) =>
  computeDtrFields(new Date("2026-11-18T00:00:00.000Z"),
    [{ punchType: "IN", punchedAt: mnl(i) }, { punchType: "OUT", punchedAt: mnl(o) }], shift, nsd, "Asia/Manila");

describe("PAY-185 a day's late and undertime are capped at the day's working minutes", () => {
  it("U1 (T1) in 00:47, out 00:48: undertime is the whole working day, 480, not 971", () => {
    const r = day("00:47", "00:48");
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(480);
  });
  it("U1b in 08:00, out 08:01: 480, not 539", () => {
    expect(day("08:00", "08:01").undertimeMinutes).toBe(480);
  });
  it("U1c late 2 hours, out 11:00: late 120 plus undertime 360 is 480", () => {
    const r = day("10:00", "11:00");
    expect(r.lateMinutes + r.undertimeMinutes).toBe(480);
  });
  it("U2 ordinary days unchanged", () => {
    expect(day("08:00", "16:30").undertimeMinutes).toBe(30);
    const r = day("08:15", "17:00");
    expect([r.lateMinutes, r.undertimeMinutes]).toEqual([15, 0]);
  });
});
