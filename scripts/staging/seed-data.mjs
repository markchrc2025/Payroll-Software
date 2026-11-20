// STAGING ONLY: everything below the company is created through the app's own
// API (see api-client.mjs), as an HR admin would, so validation, permissions,
// defaults and the payroll engine all run for real.
//
// The scenario covers what unit 1.8 changes (1 to 15 Nov 2026; 1 Nov is a
// Sunday, so the cutoff has 10 Mon-Fri days and 12 Mon-Sat days):
//   QA-01 monthly ₱30,000, semi-monthly, 5-day week, full attendance
//   QA-02 monthly ₱25,000, semi-monthly, 6-day week, one unpaid day
//   QA-03 daily ₱695, semi-monthly, 6-day week
//   QA-04 weekly ₱4,200, weekly, 6-day week (weekly run 9 to 15 Nov)
//   QA-05 monthly ₱28,000, semi-monthly, 5-day week, hired 9 Nov (mid-cutoff)
// then REGULAR semi-monthly runs for 1-15 Nov and 16-30 Nov (the second
// cutoff is where the default SECOND_CUTOFF rule deducts SSS, PhilHealth and
// Pag-IBIG; 16 Nov is a Monday: 11 Mon-Fri days, 13 Mon-Sat days) and a
// weekly run for 9-15 Nov.

export const SHIFTS = [
  { key: "5day", body: { name: "QA 5-day (Mon-Fri)", code: "QA5", type: "FIXED", timeIn: "08:00", timeOut: "17:00", breakMinutes: 60, workDays: ["MON", "TUE", "WED", "THU", "FRI"] } },
  { key: "6day", body: { name: "QA 6-day (Mon-Sat)", code: "QA6", type: "FIXED", timeIn: "08:00", timeOut: "17:00", breakMinutes: 60, workDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] } },
];

export const EMPLOYEES = [
  { tag: "QA-01", firstName: "Ana", lastName: "Santos (QA-01)", salaryType: "MONTHLY", basicSalary: 30000, payFrequency: "SEMI_MONTHLY", shift: "5day", hireDate: "2025-03-03",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "10", unpaidLeaveDays: "0" },
                 { periodStart: "2026-11-16", periodEnd: "2026-11-30", daysWorked: "11", unpaidLeaveDays: "0" }] },
  { tag: "QA-02", firstName: "Jose", lastName: "Dela Cruz (QA-02)", salaryType: "MONTHLY", basicSalary: 25000, payFrequency: "SEMI_MONTHLY", shift: "6day", hireDate: "2024-07-01",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "11", unpaidLeaveDays: "1", notes: "1 day unpaid leave (QA)" },
                 { periodStart: "2026-11-16", periodEnd: "2026-11-30", daysWorked: "13", unpaidLeaveDays: "0" }] },
  { tag: "QA-03", firstName: "Maria", lastName: "Garcia (QA-03)", salaryType: "DAILY", basicSalary: 695, payFrequency: "SEMI_MONTHLY", shift: "6day", hireDate: "2025-01-06",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "12", unpaidLeaveDays: "0" },
                 { periodStart: "2026-11-16", periodEnd: "2026-11-30", daysWorked: "13", unpaidLeaveDays: "0" }] },
  { tag: "QA-04", firstName: "Paolo", lastName: "Reyes (QA-04)", salaryType: "WEEKLY", basicSalary: 4200, payFrequency: "WEEKLY", shift: "6day", hireDate: "2025-05-05",
    attendance: [{ periodStart: "2026-11-09", periodEnd: "2026-11-15", daysWorked: "6", unpaidLeaveDays: "0" }] },
  { tag: "QA-05", firstName: "Liza", lastName: "Mendoza (QA-05)", salaryType: "MONTHLY", basicSalary: 28000, payFrequency: "SEMI_MONTHLY", shift: "5day", hireDate: "2026-11-09",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "5", unpaidLeaveDays: "0", notes: "hired 9 Nov (QA)" },
                 { periodStart: "2026-11-16", periodEnd: "2026-11-30", daysWorked: "11", unpaidLeaveDays: "0" }] },
];

// PAY-180: leave types, so leave can be filed in ESS on staging. Service
// Incentive Leave is the statutory 5 days a year (Labor Code Art. 95).
export const LEAVE_TYPES = [
  { code: "SIL", name: "Service Incentive Leave", isPaid: true, isConvertibleToCash: true, accrualFrequency: "ANNUALLY", accrualAmount: 5 },
  { code: "VL", name: "Vacation Leave", isPaid: true, accrualFrequency: "MONTHLY", accrualAmount: 1.25 },
  { code: "SL", name: "Sick Leave", isPaid: true, accrualFrequency: "MONTHLY", accrualAmount: 1.25 },
  { code: "LWOP", name: "Leave Without Pay", isPaid: false, accrualFrequency: "MONTHLY", accrualAmount: 0 },
];

// PAY-180: the 2026 Philippine national holidays, from Proclamation No. 1006
// (3 Sep 2025), Section 1 A, B and D. The special working day (25 Feb, EDSA)
// is an ordinary workday for pay and is not loaded. Eid'l Fitr and Eid'l Adha
// come by separate proclamations (Section 2) and are not loaded here.
const P1006 = "Proclamation No. 1006 (2025)";
export const HOLIDAYS_2026 = [
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
].map(([name, category, date]) => ({ name, category, date, proclamationReference: P1006 }));

export const RUNS = [
  { periodStart: "2026-11-01", periodEnd: "2026-11-15", cycle: "SEMI_MONTHLY", runType: "REGULAR", notes: "QA seed: semi-monthly 1-15 Nov" },
  { periodStart: "2026-11-16", periodEnd: "2026-11-30", cycle: "SEMI_MONTHLY", runType: "REGULAR", notes: "QA seed: semi-monthly 16-30 Nov (contributions)" },
  { periodStart: "2026-11-09", periodEnd: "2026-11-15", cycle: "WEEKLY", runType: "REGULAR", notes: "QA seed: weekly 9-15 Nov" },
];

const pick = (list, pred) => (Array.isArray(list) ? list : list?.items ?? list?.data ?? []).find(pred);

export async function waitForRun(api, id, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const run = await api.must("GET", `/api/payroll/runs/${id}`);
    if (run.status !== "PROCESSING") return run;
    if (Date.now() > until) throw new Error(`run ${id} still PROCESSING after ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Seeds the scenario. Safe to call twice: existing records are reused.
 * restoreAttendance (default true) resets the seeded employees' standard
 * attendance; at start-up on a KEPT database (PAY-140) it is false, so test
 * edits survive a deploy. The seed_scenario tool restores it on request.
 */
export async function seedScenario(api, log = console.log, { restoreAttendance = true } = {}) {
  const branches = await api.must("GET", "/api/branches");
  let branch = pick(branches, (b) => b.name === "QA Head Office");
  if (!branch) branch = await api.must("POST", "/api/branches", { name: "QA Head Office", city: "Marikina", province: "Metro Manila", isHeadOffice: true });

  const depts = await api.must("GET", "/api/departments");
  let dept = pick(depts, (d) => d.name === "QA Test Data");
  if (!dept) dept = await api.must("POST", "/api/departments", { name: "QA Test Data", description: "Seeded test employees (staging)" });

  const shiftList = await api.must("GET", "/api/shifts");
  const shiftIds = {};
  for (const s of SHIFTS) {
    const found = pick(shiftList, (x) => x.code === s.body.code);
    shiftIds[s.key] = (found ?? (await api.must("POST", "/api/shifts", s.body))).id;
  }

  const leaveTypes = await api.must("GET", "/api/leave-types?limit=100");
  for (const lt of LEAVE_TYPES) {
    if (!pick(leaveTypes, (x) => x.code === lt.code)) await api.must("POST", "/api/leave-types", lt);
  }

  // Only the holidays not yet on file (same date and name), so a kept
  // database gets no writes on restart.
  const onFile = (await api.must("GET", "/api/holidays?year=2026")) ?? [];
  const have = new Set(
    onFile.map((h) => `${String(h.date).slice(0, 10)}|${String(h.name).toLowerCase()}`),
  );
  const missingHolidays = HOLIDAYS_2026.filter((h) => !have.has(`${h.date}|${h.name.toLowerCase()}`));
  if (missingHolidays.length > 0) await api.must("POST", "/api/holidays/bulk", { rows: missingHolidays });

  const existing = await api.must("GET", "/api/employees?limit=500");
  const employeeIds = {};
  for (const e of EMPLOYEES) {
    const found = pick(existing, (x) => x.lastName === e.lastName);
    const created = found ?? await api.must("POST", "/api/employees", {
      firstName: e.firstName,
      lastName: e.lastName,
      mobileNumber: "",
      bankAccountNumber: "",
      branchId: branch.id,
      departmentId: dept.id,
      hireDate: e.hireDate,
      basicSalary: e.basicSalary,
      salaryType: e.salaryType,
      payFrequency: e.payFrequency,
      shiftScheduleId: shiftIds[e.shift],
      employmentStatus: "REGULAR",
    });
    employeeIds[e.tag] = created.id;
    // POST /api/period-inputs is an upsert per employee and period, so a
    // re-seed restores the standard attendance instead of duplicating it.
    // A new employee always gets it; an existing one only when asked.
    if (!found || restoreAttendance) {
      for (const a of e.attendance) {
        await api.must("POST", "/api/period-inputs", { employeeId: created.id, ...a });
      }
    }
  }
  log(`[staging] seed: branch, department, 2 schedules, ${LEAVE_TYPES.length} leave types, ${HOLIDAYS_2026.length} holidays, ${EMPLOYEES.length} employees with attendance`);

  const runList = await api.must("GET", "/api/payroll/runs?limit=100");
  const runs = [];
  for (const r of RUNS) {
    const found = pick(runList, (x) => x.periodStart?.slice(0, 10) === r.periodStart && x.periodEnd?.slice(0, 10) === r.periodEnd && x.runType === r.runType);
    const book = found ?? (await api.must("POST", "/api/payroll/runs", r));
    runs.push(await waitForRun(api, book.id));
  }
  for (const run of runs) {
    const sheets = run.sheets ?? [];
    log(`[staging] seed: run ${run.periodStart?.slice(0, 10)}..${run.periodEnd?.slice(0, 10)} ${run.cycle} ${run.status}, ${sheets.length} sheet(s)`);
  }
  return { branchId: branch.id, departmentId: dept.id, shiftIds, employeeIds, runIds: runs.map((r) => r.id) };
}

// PAY-170 part 2: a full cutoff of real punches for the five QA employees, as
// a ZKTeco ATTLOG file (1_attlog.dat: user id, date and time, device, state,
// verify, work code; state 0 in, 1 out, 2 break out, 3 break in, 5 OT out).
// Each employee works their shift's days from the later of the cutoff start
// and their hire date, 08:00 to 17:00, except (counting their workdays from 0):
//   QA-01  day 1: in 08:15 (15 min late)
//   QA-02  day 2: no punches (absent); day 3: out 16:30 (30 min undertime)
//   QA-03  day 1: out 19:00 on the OT state (2 h over); day 4: in only (missing out)
//   QA-04  day 0: break out 12:00 and back 13:00 (break punches, skipped)
//   QA-05  plain days from the hire date
const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function buildPunchCutoff(employees, from, to) {
  const lines = [];
  const plan = [];
  for (const def of EMPLOYEES) {
    const emp = employees.find((e) => String(e.lastName ?? "").includes(`(${def.tag})`));
    if (!emp) continue;
    const workDays = SHIFTS.find((s) => s.key === def.shift).body.workDays;
    const start = def.hireDate > from ? def.hireDate : from;
    const days = [];
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
      const d = new Date(t);
      if (workDays.includes(WEEKDAY[d.getUTCDay()])) days.push(d.toISOString().slice(0, 10));
    }
    const num = emp.employeeNumber;
    const at = (day, hm, state) => lines.push(`${num}\t${day} ${hm}:00\t1\t${state}\t1\t0`);
    days.forEach((day, i) => {
      const k = `${def.tag}:${i}`;
      if (k === "QA-02:2") { plan.push({ employee: def.tag, day, case: "absent" }); return; }
      if (k === "QA-03:4") { at(day, "08:00", 0); plan.push({ employee: def.tag, day, case: "missing out" }); return; }
      at(day, k === "QA-01:1" ? "08:15" : "08:00", 0);
      if (k === "QA-04:0") { at(day, "12:00", 2); at(day, "13:00", 3); }
      if (k === "QA-03:1") at(day, "19:00", 5);
      else at(day, k === "QA-02:3" ? "16:30" : "17:00", 1);
      if (k === "QA-01:1") plan.push({ employee: def.tag, day, case: "15 min late" });
      if (k === "QA-02:3") plan.push({ employee: def.tag, day, case: "30 min undertime" });
      if (k === "QA-03:1") plan.push({ employee: def.tag, day, case: "2 h overtime (file it in ESS, then approve)" });
      if (k === "QA-04:0") plan.push({ employee: def.tag, day, case: "break punches (skipped)" });
    });
  }
  return { file: lines.join("\r\n") + "\r\n", plan };
}
