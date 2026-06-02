/**
 * Unit tests for isEntitledToHolidayPay (Phase AE1)
 *
 * The function is pure in its logic (no side effects) but takes a Prisma
 * transaction as a dependency.  We mock the tx object so no real DB is needed.
 *
 * Strategy: For each test, provide a minimal fake `tx` that returns the
 * desired data from the relevant Prisma models.
 */
import { describe, expect, it, vi } from "vitest";
import { isEntitledToHolidayPay } from "@/lib/payroll/holiday-entitlement";
import type { TenantTx } from "@/lib/with-tenant";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal fake TenantTx sufficient for isEntitledToHolidayPay. */
function makeTx(opts: {
  workDays?: string[];
  /** Date keys "YYYY-MM-DD" that fall within the look-back window and are holidays. */
  priorHolidayKeys?: string[];
  /** Result for dTRRecord.findFirst — null means "no record". */
  dtrRecord?: { dayStatus: string } | null;
}): TenantTx {
  return {
    employeeShiftAssignment: {
      findFirst: vi.fn().mockResolvedValue(
        opts.workDays !== undefined
          ? {
              shiftSchedule: {
                workDays: opts.workDays,
              },
            }
          : null,
      ),
    },
    holiday: {
      findMany: vi.fn().mockResolvedValue(
        (opts.priorHolidayKeys ?? []).map((k) => ({
          date: new Date(k + "T00:00:00.000Z"),
        })),
      ),
    },
    dTRRecord: {
      findFirst: vi.fn().mockResolvedValue(
        opts.dtrRecord !== undefined ? opts.dtrRecord : null,
      ),
    },
  } as unknown as TenantTx;
}

// Monday = 2026-06-01 (weekday), Tuesday = 2026-06-02, Wednesday = 2026-06-04
// Holiday on Wednesday 2026-06-03 would look back to Tuesday 2026-06-02.
const WEDNESDAY_HOLIDAY = new Date("2026-06-03T00:00:00.000Z"); // Wednesday
const MONDAY_HOLIDAY    = new Date("2026-06-08T00:00:00.000Z"); // Monday

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isEntitledToHolidayPay — day-before rule", () => {
  it("PRESENT on the day before → entitled = true", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "PRESENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);
  });

  it("PAID_LEAVE on the day before → entitled = true", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "PAID_LEAVE" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);
  });

  it("ABSENT on the day before → entitled = false", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "ABSENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(false);
  });

  it("UNPAID_LEAVE on the day before → entitled = false", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "UNPAID_LEAVE" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(false);
  });

  it("No DTR record for the day before → entitled = true (new hire default)", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: null,
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);
  });

  it("No shift assignment → defaults to Mon–Fri, then checks day before", async () => {
    // null shiftAssignment → workDays defaults to Mon–Fri
    const tx = makeTx({
      workDays: undefined, // triggers null assignment return
      dtrRecord: { dayStatus: "PRESENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      WEDNESDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);
  });

  it("Monday holiday → skips Sunday (rest day) and checks Friday", async () => {
    // 2026-06-08 is a Monday.  Mon-Fri schedule → Sunday is a rest day.
    // The function should skip Sunday and pick Friday 2026-06-05 as candidate.
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "PRESENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      MONDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);

    // Verify the DTR query was called with Friday 2026-06-05 (not Saturday or Sunday)
    const dtrCall = (tx.dTRRecord.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const queriedDate: Date = dtrCall.where.date;
    expect(queriedDate.getUTCDay()).toBe(5); // 5 = Friday
    expect(queriedDate.toISOString().slice(0, 10)).toBe("2026-06-05");
  });

  it("Monday holiday — ABSENT on Friday → entitled = false", async () => {
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      dtrRecord: { dayStatus: "ABSENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      MONDAY_HOLIDAY,
      "tenant-1",
      tx,
    );
    expect(result).toBe(false);
  });

  it("Holiday immediately preceded by another holiday → skips prior holiday", async () => {
    // 2026-06-04 Thursday holiday.  2026-06-03 Wednesday is ALSO a holiday.
    // Look-back should skip 06-03 and pick 06-02 Tuesday.
    const thursdayHoliday = new Date("2026-06-04T00:00:00.000Z");
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      priorHolidayKeys: ["2026-06-03"],
      dtrRecord: { dayStatus: "PRESENT" },
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      thursdayHoliday,
      "tenant-1",
      tx,
    );
    expect(result).toBe(true);

    // DTR query should have been called with 2026-06-02 (Tuesday, skipping the 06-03 holiday)
    const dtrCall = (tx.dTRRecord.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const queriedDate: Date = dtrCall.where.date;
    expect(queriedDate.toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  it("Entire 7-day look-back is rest days or holidays → defaults to entitled", async () => {
    // Mon–Sun where all 7 prior days are either rest days or holidays.
    // Sat/Sun = rest days; Mon-Fri prior week = all marked as holidays.
    const holidayNext = new Date("2026-06-15T00:00:00.000Z"); // Monday
    const tx = makeTx({
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      priorHolidayKeys: [
        "2026-06-08", // Mon
        "2026-06-09", // Tue
        "2026-06-10", // Wed
        "2026-06-11", // Thu
        "2026-06-12", // Fri
        // Sat 06-13 and Sun 06-14 are rest days
      ],
      dtrRecord: null,
    });
    const result = await isEntitledToHolidayPay(
      "emp-1",
      holidayNext,
      "tenant-1",
      tx,
    );
    // No qualifying day found → entitled by default
    expect(result).toBe(true);
    // dTRRecord.findFirst should NOT have been called (no candidate was found)
    expect((tx.dTRRecord.findFirst as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});
