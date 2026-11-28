/**
 * PAY-74: what a new company starts with (Mark, 28 Nov 2026: self-serve
 * sign-up next). Premium rates, the company lists and the seeded deductions
 * already default in code; these are the rows a company needs before its first
 * payroll run that nothing else creates.
 *
 * Readings taken without a ruling (flagged to Mark): leave types are only the
 * statutory Service Incentive Leave and Leave Without Pay (vacation and sick
 * leave are each company's own policy); no department is created.
 */

export const HEAD_OFFICE = { name: "Head Office", isHeadOffice: true } as const;

export const DEFAULT_SHIFTS = [
  { name: "Regular 5-day (Mon to Fri)", code: "REG5", workDays: ["MON", "TUE", "WED", "THU", "FRI"] },
  { name: "Regular 6-day (Mon to Sat)", code: "REG6", workDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
].map((s) => ({ ...s, type: "FIXED" as const, timeIn: "08:00", timeOut: "17:00", breakMinutes: 60 }));

export const DEFAULT_LEAVE_TYPES = [
  // Labor Code Art. 95: 5 days a year with pay after a year of service, convertible to cash.
  { code: "SIL", name: "Service Incentive Leave", isPaid: true, isConvertibleToCash: true, accrualFrequency: "ANNUALLY" as const, accrualAmount: 5 },
  { code: "LWOP", name: "Leave Without Pay", isPaid: false, isConvertibleToCash: false, accrualFrequency: "MONTHLY" as const, accrualAmount: 0 },
];

type HolidayRow = { name: string; category: "LEGAL" | "SPECIAL_NON_WORKING"; date: string; proclamationReference: string };
const rows = (ref: string, list: [string, HolidayRow["category"], string][]): HolidayRow[] =>
  list.map(([name, category, date]) => ({ name, category, date, proclamationReference: ref }));

/**
 * National holidays by year. Special working days (25 Feb, EDSA) are ordinary
 * workdays for pay and are not loaded. Eid'l Fitr and Eid'l Adha come by
 * separate proclamations each year and are added by the company when issued.
 */
export const NATIONAL_HOLIDAYS: Record<number, HolidayRow[]> = {
  // Proclamation No. 1006 (3 Sep 2025), Section 1 A, B and D.
  2026: rows("Proclamation No. 1006 (2025)", [
    ["New Year's Day", "LEGAL", "2026-01-01"],
    ["Maundy Thursday", "LEGAL", "2026-04-02"],
    ["Good Friday", "LEGAL", "2026-04-03"],
    ["Araw ng Kagitingan", "LEGAL", "2026-04-09"],
    ["Labor Day", "LEGAL", "2026-05-01"],
    ["Independence Day", "LEGAL", "2026-06-12"],
    ["National Heroes Day", "LEGAL", "2026-08-31"],
    ["Bonifacio Day", "LEGAL", "2026-11-30"],
    ["Christmas Day", "LEGAL", "2026-12-25"],
    ["Rizal Day", "LEGAL", "2026-12-30"],
    ["Ninoy Aquino Day", "SPECIAL_NON_WORKING", "2026-08-21"],
    ["All Saints' Day", "SPECIAL_NON_WORKING", "2026-11-01"],
    ["Feast of the Immaculate Conception of Mary", "SPECIAL_NON_WORKING", "2026-12-08"],
    ["Last Day of the Year", "SPECIAL_NON_WORKING", "2026-12-31"],
    ["Chinese New Year", "SPECIAL_NON_WORKING", "2026-02-17"],
    ["Black Saturday", "SPECIAL_NON_WORKING", "2026-04-04"],
    ["All Souls' Day", "SPECIAL_NON_WORKING", "2026-11-02"],
    ["Christmas Eve", "SPECIAL_NON_WORKING", "2026-12-24"],
  ]),
  // Proclamation No. 1427 (8 Sep 2026): 10 regular holidays, 4 special
  // non-working days and 4 additional special non-working days.
  2027: rows("Proclamation No. 1427 (2026)", [
    ["New Year's Day", "LEGAL", "2027-01-01"],
    ["Maundy Thursday", "LEGAL", "2027-03-25"],
    ["Good Friday", "LEGAL", "2027-03-26"],
    ["Araw ng Kagitingan", "LEGAL", "2027-04-09"],
    ["Labor Day", "LEGAL", "2027-05-01"],
    ["Independence Day", "LEGAL", "2027-06-12"],
    ["National Heroes Day", "LEGAL", "2027-08-30"],
    ["Bonifacio Day", "LEGAL", "2027-11-30"],
    ["Christmas Day", "LEGAL", "2027-12-25"],
    ["Rizal Day", "LEGAL", "2027-12-30"],
    ["Ninoy Aquino Day", "SPECIAL_NON_WORKING", "2027-08-21"],
    ["All Saints' Day", "SPECIAL_NON_WORKING", "2027-11-01"],
    ["Feast of the Immaculate Conception of Mary", "SPECIAL_NON_WORKING", "2027-12-08"],
    ["Last Day of the Year", "SPECIAL_NON_WORKING", "2027-12-31"],
    ["Chinese New Year", "SPECIAL_NON_WORKING", "2027-02-06"],
    ["Black Saturday", "SPECIAL_NON_WORKING", "2027-03-27"],
    ["All Souls' Day", "SPECIAL_NON_WORKING", "2027-11-02"],
    ["Christmas Eve", "SPECIAL_NON_WORKING", "2027-12-24"],
  ]),
};
