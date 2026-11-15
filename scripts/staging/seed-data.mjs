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
// then a REGULAR semi-monthly run for 1-15 Nov and a weekly run for 9-15 Nov.

export const SHIFTS = [
  { key: "5day", body: { name: "QA 5-day (Mon-Fri)", code: "QA5", type: "FIXED", timeIn: "08:00", timeOut: "17:00", breakMinutes: 60, workDays: ["MON", "TUE", "WED", "THU", "FRI"] } },
  { key: "6day", body: { name: "QA 6-day (Mon-Sat)", code: "QA6", type: "FIXED", timeIn: "08:00", timeOut: "17:00", breakMinutes: 60, workDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] } },
];

export const EMPLOYEES = [
  { tag: "QA-01", firstName: "Ana", lastName: "Santos (QA-01)", salaryType: "MONTHLY", basicSalary: 30000, payFrequency: "SEMI_MONTHLY", shift: "5day", hireDate: "2025-03-03",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "10", unpaidLeaveDays: "0" }] },
  { tag: "QA-02", firstName: "Jose", lastName: "Dela Cruz (QA-02)", salaryType: "MONTHLY", basicSalary: 25000, payFrequency: "SEMI_MONTHLY", shift: "6day", hireDate: "2024-07-01",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "11", unpaidLeaveDays: "1", notes: "1 day unpaid leave (QA)" }] },
  { tag: "QA-03", firstName: "Maria", lastName: "Garcia (QA-03)", salaryType: "DAILY", basicSalary: 695, payFrequency: "SEMI_MONTHLY", shift: "6day", hireDate: "2025-01-06",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "12", unpaidLeaveDays: "0" }] },
  { tag: "QA-04", firstName: "Paolo", lastName: "Reyes (QA-04)", salaryType: "WEEKLY", basicSalary: 4200, payFrequency: "WEEKLY", shift: "6day", hireDate: "2025-05-05",
    attendance: [{ periodStart: "2026-11-09", periodEnd: "2026-11-15", daysWorked: "6", unpaidLeaveDays: "0" }] },
  { tag: "QA-05", firstName: "Liza", lastName: "Mendoza (QA-05)", salaryType: "MONTHLY", basicSalary: 28000, payFrequency: "SEMI_MONTHLY", shift: "5day", hireDate: "2026-11-09",
    attendance: [{ periodStart: "2026-11-01", periodEnd: "2026-11-15", daysWorked: "5", unpaidLeaveDays: "0", notes: "hired 9 Nov (QA)" }] },
];

export const RUNS = [
  { periodStart: "2026-11-01", periodEnd: "2026-11-15", cycle: "SEMI_MONTHLY", runType: "REGULAR", notes: "QA seed: semi-monthly 1-15 Nov" },
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

/** Seeds the scenario. Safe to call twice: skips anything already there. */
export async function seedScenario(api, log = console.log) {
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

  const existing = await api.must("GET", "/api/employees?limit=500");
  const employeeIds = {};
  for (const e of EMPLOYEES) {
    const found = pick(existing, (x) => x.lastName === e.lastName);
    if (found) { employeeIds[e.tag] = found.id; continue; }
    const created = await api.must("POST", "/api/employees", {
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
    for (const a of e.attendance) {
      await api.must("POST", "/api/period-inputs", { employeeId: created.id, ...a });
    }
  }
  log(`[staging] seed: branch, department, 2 schedules, ${EMPLOYEES.length} employees with attendance`);

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
