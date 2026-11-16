/**
 * PAY-141: paydays and DTR cutoff windows (pure module).
 *
 *   S1  default semi-monthly schedule: paydays 15th and month-end; cutoff
 *       and pay period are the same dates (today's behaviour).
 *   S2  Mark's example: 26th to 10th feeds the 15th, 11th to 25th feeds the
 *       30th; the pay periods stay 1 to 15 and 16 to month-end.
 *   S3  "30th" is the last day: 31 Oct, 28 Feb, 29 Feb in a leap year.
 *   S4  a Sunday or holiday payday moves to the working day before (twice
 *       in a row if needed); Saturday stays.
 *   S5  monthly: one payday, cutoff 26th to 25th, pay period the month.
 *   S6  weekly: payday Saturday, cutoff Saturday to Friday ending the day
 *       before; a holiday Saturday pays on Friday.
 *   S7  daily: paid the day itself.
 *   S8  resolvePayday refuses a date that is not a payday.
 *   S9  scheduleProblems: gaps, overlaps, same payday twice, bad days.
 *   S10 year boundary: the 15 Jan payday's cutoff starts 26 Dec.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULES,
  listPaydays,
  resolvePayday,
  scheduleProblems,
  type PayScheduleConfig,
} from "@/lib/payroll/pay-schedule";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MARK: PayScheduleConfig = {
  cycle: "SEMI_MONTHLY",
  slots: [
    { payDay: 15, cutoffStartDay: 26, cutoffEndDay: 10 },
    { payDay: 30, cutoffStartDay: 11, cutoffEndDay: 25 },
  ],
};
const pick = (o: ReturnType<typeof listPaydays>[number]) => ({
  nominal: o.nominalDate, pay: o.payDate, cutoff: `${o.cutoffStart}..${o.cutoffEnd}`, period: `${o.periodStart}..${o.periodEnd}`,
});

describe("PAY-141 S1 default semi-monthly", () => {
  it("15th and month-end, cutoff equals pay period", () => {
    const occ = listPaydays({ cycle: "SEMI_MONTHLY", from: d("2026-10-01"), to: d("2026-10-31") }).map(pick);
    expect(occ).toEqual([
      { nominal: "2026-10-15", pay: "2026-10-15", cutoff: "2026-10-01..2026-10-15", period: "2026-10-01..2026-10-15" },
      { nominal: "2026-10-31", pay: "2026-10-31", cutoff: "2026-10-16..2026-10-31", period: "2026-10-16..2026-10-31" },
    ]);
  });
});

describe("PAY-141 S2 Mark's cutoffs", () => {
  it("26th to 10th feeds the 15th, 11th to 25th feeds the 30th", () => {
    const occ = listPaydays({ cycle: "SEMI_MONTHLY", config: MARK, from: d("2026-11-01"), to: d("2026-11-30") }).map(pick);
    expect(occ).toEqual([
      { nominal: "2026-11-15", pay: "2026-11-14", cutoff: "2026-10-26..2026-11-10", period: "2026-11-01..2026-11-15" },
      { nominal: "2026-11-30", pay: "2026-11-30", cutoff: "2026-11-11..2026-11-25", period: "2026-11-16..2026-11-30" },
    ]);
  });
});

describe("PAY-141 S3 the 30th is the last day of the month", () => {
  it("31 Oct, 28 Feb 2027, 29 Feb 2028", () => {
    const end = (from: string, to: string) =>
      listPaydays({ cycle: "SEMI_MONTHLY", config: MARK, from: d(from), to: d(to) }).at(-1)!.nominalDate;
    expect(end("2026-10-01", "2026-10-31")).toBe("2026-10-31");
    expect(end("2027-02-01", "2027-02-28")).toBe("2027-02-28");
    expect(end("2028-02-01", "2028-02-29")).toBe("2028-02-29");
  });
});

describe("PAY-141 S4 Sunday and holiday paydays move back", () => {
  it("Sunday 15 Nov pays Saturday 14 Nov (S2 above); a holiday Friday then Thursday", () => {
    // 30 Oct 2026 is a Friday; 31 Oct Saturday. Holiday on 31 Oct and 30 Oct: pay Thursday 29 Oct.
    const occ = listPaydays({
      cycle: "SEMI_MONTHLY", from: d("2026-10-31"), to: d("2026-10-31"), holidays: new Set(["2026-10-31", "2026-10-30"]),
    });
    expect(occ[0]).toMatchObject({ nominalDate: "2026-10-31", payDate: "2026-10-29", moved: true });
  });
  it("a Saturday payday that is not a holiday stays", () => {
    const occ = listPaydays({ cycle: "SEMI_MONTHLY", from: d("2026-10-31"), to: d("2026-10-31") });
    expect(occ[0]).toMatchObject({ payDate: "2026-10-31", moved: false });
  });
  it("30 Nov 2026 (Monday, Bonifacio Day) pays Saturday 28 Nov", () => {
    const occ = listPaydays({ cycle: "SEMI_MONTHLY", config: MARK, from: d("2026-11-30"), to: d("2026-11-30"), holidays: new Set(["2026-11-30"]) });
    expect(occ[0]).toMatchObject({ payDate: "2026-11-28", moved: true });
  });
});

describe("PAY-141 S5 monthly", () => {
  it("paid the 30th for the 26th to 25th; the pay period is the month", () => {
    const cfg: PayScheduleConfig = { cycle: "MONTHLY", slots: [{ payDay: 30, cutoffStartDay: 26, cutoffEndDay: 25 }] };
    expect(listPaydays({ cycle: "MONTHLY", config: cfg, from: d("2026-12-01"), to: d("2026-12-31") }).map(pick)).toEqual([
      { nominal: "2026-12-31", pay: "2026-12-31", cutoff: "2026-11-26..2026-12-25", period: "2026-12-01..2026-12-31" },
    ]);
    expect(listPaydays({ cycle: "MONTHLY", from: d("2026-12-01"), to: d("2026-12-31") }).map(pick)[0].cutoff)
      .toBe("2026-12-01..2026-12-31"); // default
  });
});

describe("PAY-141 S6 weekly", () => {
  it("every Saturday, Saturday-to-Friday cutoff ending the day before", () => {
    expect(listPaydays({ cycle: "WEEKLY", from: d("2026-11-16"), to: d("2026-11-30") }).map(pick)).toEqual([
      { nominal: "2026-11-21", pay: "2026-11-21", cutoff: "2026-11-14..2026-11-20", period: "2026-11-14..2026-11-20" },
      { nominal: "2026-11-28", pay: "2026-11-28", cutoff: "2026-11-21..2026-11-27", period: "2026-11-21..2026-11-27" },
    ]);
  });
  it("a holiday Saturday pays on Friday; the cutoff does not change", () => {
    const [o] = listPaydays({ cycle: "WEEKLY", from: d("2026-12-26"), to: d("2026-12-26"), holidays: new Set(["2026-12-26"]) });
    expect(o).toMatchObject({ payDate: "2026-12-25", cutoffStart: "2026-12-19", cutoffEnd: "2026-12-25" });
  });
});

describe("PAY-141 S7 daily", () => {
  it("paid the day itself", () => {
    const occ = listPaydays({ cycle: "DAILY", from: d("2026-11-15"), to: d("2026-11-16") }).map(pick);
    expect(occ).toEqual([
      { nominal: "2026-11-15", pay: "2026-11-15", cutoff: "2026-11-15..2026-11-15", period: "2026-11-15..2026-11-15" },
      { nominal: "2026-11-16", pay: "2026-11-16", cutoff: "2026-11-16..2026-11-16", period: "2026-11-16..2026-11-16" },
    ]);
  });
});

describe("PAY-141 S8 resolvePayday", () => {
  it("finds a payday and refuses a date that is not one", () => {
    expect(resolvePayday({ cycle: "SEMI_MONTHLY", config: MARK, nominalDate: "2026-11-15" })?.cutoffStart).toBe("2026-10-26");
    expect(resolvePayday({ cycle: "SEMI_MONTHLY", config: MARK, nominalDate: "2026-11-14" })).toBeNull();
    expect(resolvePayday({ cycle: "WEEKLY", nominalDate: "2026-11-20" })).toBeNull(); // a Friday
    expect(resolvePayday({ cycle: "WEEKLY", nominalDate: "nonsense" })).toBeNull();
  });
});

describe("PAY-141 S9 scheduleProblems", () => {
  it("accepts the defaults and Mark's schedule", () => {
    expect(scheduleProblems(DEFAULT_SCHEDULES.SEMI_MONTHLY)).toEqual([]);
    expect(scheduleProblems(DEFAULT_SCHEDULES.MONTHLY)).toEqual([]);
    expect(scheduleProblems(MARK)).toEqual([]);
    expect(scheduleProblems({ cycle: "MONTHLY", slots: [{ payDay: 30, cutoffStartDay: 26, cutoffEndDay: 25 }] })).toEqual([]);
  });
  it("refuses gaps, overlaps, one payday twice and bad days", () => {
    const gap = { ...MARK, slots: [MARK.slots[0], { ...MARK.slots[1], cutoffStartDay: 12 }] };
    expect(scheduleProblems(gap)[0]).toMatch(/whole month/);
    const same = { ...MARK, slots: [MARK.slots[0], { ...MARK.slots[1], payDay: 15 }] };
    expect(scheduleProblems(same)[0]).toMatch(/different/);
    const bad = { ...MARK, slots: [{ ...MARK.slots[0], payDay: 0 }, MARK.slots[1]] };
    expect(scheduleProblems(bad)).toEqual(["Days must be whole numbers from 1 to 31."]);
    expect(scheduleProblems({ cycle: "MONTHLY", slots: [{ payDay: 30, cutoffStartDay: 1, cutoffEndDay: 25 }] })[0]).toMatch(/whole month/);
    expect(scheduleProblems({ cycle: "SEMI_MONTHLY", slots: [MARK.slots[0]] })[0]).toMatch(/two paydays/);
  });
});

describe("PAY-141 S10 year boundary", () => {
  it("the 15 Jan 2027 payday's cutoff starts 26 Dec 2026", () => {
    expect(resolvePayday({ cycle: "SEMI_MONTHLY", config: MARK, nominalDate: "2027-01-15" })).toMatchObject({
      cutoffStart: "2026-12-26", cutoffEnd: "2027-01-10", periodStart: "2027-01-01", periodEnd: "2027-01-15",
    });
  });
});
