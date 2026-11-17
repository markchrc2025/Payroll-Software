/**
 * PAY-146 (HR.my review D5, Mark chose B on 16 Nov 2026): meal breaks.
 * Before: an unpaid break was deducted in full on any day, so a 4-hour half
 * day lost the whole hour, and any break length could be saved.
 *
 *   M1  (T1) a 4-hour day loses no break; a full day still loses the hour.
 *   M2  a day just over the setting (5 h 10 min) loses only the 10 minutes
 *       over it, so it never drops below the setting.
 *   M3  the company setting moves the line (6 hours); FLOATING behaves the
 *       same; paid and punch-out breaks are unchanged.
 *   M4  an unpaid break of 1 to 19 minutes is refused, 20 to 59 warns, 0 (no
 *       break) and any paid break are fine; the shift create schema refuses
 *       15 minutes unpaid.
 *   M5  the setting reaches the DTR from both writers (punch and manual
 *       edit), the shift update checks the break as it will be saved, and
 *       the column is guarded in the database.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeDtrFields, type AttendancePunch, type ShiftContext } from "@/lib/attendance/compute-dtr";
import { breakDeduction, mealBreakProblem, mealBreakWarning } from "@/lib/attendance/meal-break";
import { createShiftScheduleSchema } from "@/lib/validations/dtr";

const DATE = new Date("2026-06-15T00:00:00.000Z");
function punch(type: "IN" | "OUT", h: number, m = 0): AttendancePunch {
  const d = new Date(DATE);
  d.setUTCHours(h, m, 0, 0);
  return { punchType: type, punchedAt: d };
}
function shift(o: Partial<ShiftContext> = {}): ShiftContext {
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
    ...o,
  };
}
const worked = (out: [number, number], s: ShiftContext = shift()) =>
  computeDtrFields(DATE, [punch("IN", 8), punch("OUT", out[0], out[1])], s).workedMinutes;

describe("PAY-146 meal break", () => {
  it("M1 (T1) a 4-hour day loses no break; a full day still loses the hour", () => {
    expect(worked([12, 0])).toBe(240);
    expect(worked([17, 0])).toBe(480);
  });

  it("M2 a day just over the setting loses only the minutes over it", () => {
    expect(worked([13, 10])).toBe(300); // 5 h 10 min span, 10 min deducted
    expect(worked([13, 0])).toBe(300); // exactly 5 h: nothing deducted
    expect(worked([14, 30])).toBe(330); // 6 h 30 min: the full hour
    expect(breakDeduction(310, 60)).toBe(10);
    expect(breakDeduction(300, 60)).toBe(0);
    expect(breakDeduction(600, 0)).toBe(0);
  });

  it("M3 the company setting moves the line; other policies unchanged", () => {
    expect(worked([14, 0], shift({ breakDeductAfterMinutes: 360 }))).toBe(360);
    expect(worked([15, 0], shift({ breakDeductAfterMinutes: 360 }))).toBe(360); // 7 h: 60 deducted
    expect(worked([12, 0], shift({ breakPolicy: "FLOATING" }))).toBe(240);
    expect(worked([17, 0], shift({ breakPolicy: "FLOATING" }))).toBe(480);
    expect(worked([17, 0], shift({ breakPolicy: "PAID_BREAK" }))).toBe(540);
    const split = computeDtrFields(
      DATE,
      [punch("IN", 8), punch("OUT", 12), punch("IN", 13), punch("OUT", 17)],
      shift({ breakPolicy: "PUNCH_IN_OUT" }),
    );
    expect(split.workedMinutes).toBe(480);
  });

  it("M4 unpaid breaks under 20 minutes are refused, under 60 warn", () => {
    expect(mealBreakProblem(0, "FIXED_DEDUCTION")).toBeNull();
    expect(mealBreakProblem(15, "FIXED_DEDUCTION")).toMatch(/at least 20 minutes/);
    expect(mealBreakProblem(19, "FLOATING")).toMatch(/at least 20 minutes/);
    expect(mealBreakProblem(15, "PUNCH_IN_OUT")).toMatch(/at least 20 minutes/);
    expect(mealBreakProblem(15, "PAID_BREAK")).toBeNull();
    expect(mealBreakProblem(20, "FIXED_DEDUCTION")).toBeNull();
    expect(mealBreakWarning(20, "FIXED_DEDUCTION")).toMatch(/Under 60 minutes/);
    expect(mealBreakWarning(45, "FLOATING")).toMatch(/Under 60 minutes/);
    expect(mealBreakWarning(60, "FIXED_DEDUCTION")).toBeNull();
    expect(mealBreakWarning(30, "PAID_BREAK")).toBeNull();
    expect(mealBreakWarning(0, "FIXED_DEDUCTION")).toBeNull();

    const base = { name: "Short", type: "FIXED", timeIn: "08:00", timeOut: "17:00", workDays: ["MON"] };
    const bad = createShiftScheduleSchema.safeParse({ ...base, breakMinutes: 15, breakPolicy: "FIXED_DEDUCTION" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path.join("."))).toContain("breakMinutes");
    expect(createShiftScheduleSchema.safeParse({ ...base, breakMinutes: 15, breakPolicy: "PAID_BREAK" }).success).toBe(true);
    expect(createShiftScheduleSchema.safeParse({ ...base, breakMinutes: 30, breakPolicy: "FIXED_DEDUCTION" }).success).toBe(true);
  });

  it("M5 the setting reaches both DTR writers; updates check the saved break; the column is guarded", () => {
    for (const f of ["src/lib/attendance/punch.ts", "src/app/api/dtr/[id]/manual/route.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(/breakDeductAfterMinutes: true,/);
      expect(s, f).toMatch(/breakDeductAfterMinutes: tenant\?\.breakDeductAfterMinutes,/);
    }
    const patch = readFileSync("src/app/api/shifts/[id]/route.ts", "utf8");
    expect(patch).toMatch(/mealBreakProblem\(\s*d\.breakMinutes \?\? existing\.breakMinutes,\s*d\.breakPolicy \?\? existing\.breakPolicy,\s*\)/);
    const mig = readFileSync("prisma/migrations/20261119000100_pay146_break_deduct_after/migration.sql", "utf8");
    expect(mig).toMatch(/"breakDeductAfterMinutes" INTEGER NOT NULL DEFAULT 300/);
    expect(mig).toMatch(/CHECK \("breakDeductAfterMinutes" BETWEEN 0 AND 1440\)/);
    const settings = readFileSync("src/app/api/settings/tenant/route.ts", "utf8");
    expect(settings).toMatch(/breakDeductAfterMinutes: z\.number\(\)\.int\(\)\.min\(0\)\.max\(1440\)\.optional\(\)/);
  });
});
