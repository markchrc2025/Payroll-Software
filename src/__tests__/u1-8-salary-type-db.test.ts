/**
 * Unit 1.8 (S4, "monthly means monthly"): the database and route parts that
 * the engine tests (u1-8-salary-type-engine) cannot reach.
 *
 *   B1  the migration backfills Employee.workingDaysDenominator from the
 *       work schedule: the current shift assignment wins over the latest
 *       term; 5 days -> 261, 6 days -> 313, anything else stays NULL (the
 *       company's applies); an existing value is never overwritten; running
 *       the file twice changes nothing.
 *   B2  the database refuses a divisor the engine cannot use (52 to 366).
 *   T3b the DTR aggregate counts unpaid days (which now reduce a monthly
 *       salary): an ABSENT or UNPAID_LEAVE workday is one unpaid day; for an
 *       attendance-exempt employee only scheduled workdays count, so rest
 *       days never become unpaid days.
 *   G3  a REGULAR run pays only the employees on its pay cycle; off-cycle,
 *       final pay and year-end keep their own selection.
 *   T6  the employee form refuses the salary type x pay cycle pairs 1.8
 *       cannot pay (R88 plus monthly x bi-weekly), with a plain message.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `u18t${sfx}`;
const id = (s: string) => `u18${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u18-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));

import { onRunCycle } from "@/lib/payroll/persist";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { POST as aggregate } from "@/app/api/employees/[id]/dtr/aggregate/route";

const MIGRATION = readFileSync(
  "prisma/migrations/20261115000000_u1_8_employee_working_days_divisor/migration.sql",
  "utf8",
);
const MON_FRI = ["MON", "TUE", "WED", "THU", "FRI"];
const MON_SAT = [...MON_FRI, "SAT"];
const ALL_WEEK = [...MON_SAT, "SUN"];

describeDb("1.8 database and DTR aggregate (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  async function schedule(key: string, days: string[]) {
    await q(
      `INSERT INTO "ShiftSchedule" (id, "tenantId", name, "timeIn", "timeOut", "workDays", "updatedAt")
       VALUES ($1, $2, $1, '08:00', '17:00', $3::jsonb, now())`,
      [id(key), T, JSON.stringify(days)],
    );
    return id(key);
  }
  async function employee(key: string, extra: { divisor?: number; exempt?: boolean } = {}) {
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate",
                               "workingDaysDenominator", "attendanceExempt", "updatedAt")
       VALUES ($1, $2, $1, 'U18', $1, '2025-01-06', $3, $4, now())`,
      [id(key), T, extra.divisor ?? null, extra.exempt ?? false],
    );
    return id(key);
  }
  const assign = (emp: string, sched: string, from = "2025-01-06") =>
    q(
      `INSERT INTO "EmployeeShiftAssignment" (id, "tenantId", "employeeId", "shiftScheduleId", "effectiveFrom", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now())`,
      [`${emp}-a-${sched.slice(3, 8)}`, T, emp, sched, from],
    );
  const term = (emp: string, sched: string) =>
    q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "shiftScheduleId", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', $4, 3000000, 'MONTHLY', now())`,
      [`${emp}-t`, T, emp, sched],
    );
  const divisorOf = async (emp: string) =>
    (await q(`SELECT "workingDaysDenominator" AS d FROM "Employee" WHERE id = $1`, [emp])).rows[0].d as number | null;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `U18${sfx}`.toUpperCase()]);
  });
  afterAll(async () => {
    for (const t of ["PeriodInput", "DTRRecord", "EmployeeShiftAssignment", "EmploymentTerm", "Employee", "ShiftSchedule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("B1 backfills the divisor from the schedule, never overwrites, and is idempotent", async () => {
    const five = await schedule("s5", MON_FRI);
    const six = await schedule("s6", MON_SAT);
    const seven = await schedule("s7", ALL_WEEK);

    const byAssignment = await employee("ea");
    await assign(byAssignment, five);
    await term(byAssignment, six); // the assignment wins over the term
    const byTerm = await employee("et");
    await term(byTerm, six);
    const sevenDay = await employee("e7");
    await assign(sevenDay, seven);
    const kept = await employee("ek", { divisor: 300 });
    await assign(kept, five);
    const none = await employee("en");

    await q(MIGRATION);
    expect(await divisorOf(byAssignment)).toBe(261);
    expect(await divisorOf(byTerm)).toBe(313);
    expect(await divisorOf(sevenDay)).toBeNull();
    expect(await divisorOf(kept)).toBe(300);
    expect(await divisorOf(none)).toBeNull();

    await q(MIGRATION); // second run: no error, no change
    expect(await divisorOf(byAssignment)).toBe(261);
    expect(await divisorOf(kept)).toBe(300);
  });

  it("B2 the database refuses a divisor outside 52 to 366", async () => {
    const emp = await employee("rng");
    await expect(q(`UPDATE "Employee" SET "workingDaysDenominator" = 400 WHERE id = $1`, [emp])).rejects.toThrow(/Employee_workingDaysDenominator_range/);
    await expect(q(`UPDATE "Employee" SET "workingDaysDenominator" = 51 WHERE id = $1`, [emp])).rejects.toThrow(/Employee_workingDaysDenominator_range/);
    await q(`UPDATE "Employee" SET "workingDaysDenominator" = 52 WHERE id = $1`, [emp]);
    expect(await divisorOf(emp)).toBe(52);
  });

  async function dtr(emp: string, date: string, dayStatus: string, workedMinutes = 0) {
    await q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"DTRDayStatus", $6, 'APPROVED', now())`,
      [`${emp}-${date}`, T, emp, `${date}T00:00:00.000Z`, dayStatus, workedMinutes],
    );
  }
  async function runAggregate(emp: string) {
    const res = await aggregate(
      new Request("http://test.local/api", {
        method: "POST",
        body: JSON.stringify({ periodStart: "2026-11-02", periodEnd: "2026-11-08", replace: true }),
      }) as never,
      { params: Promise.resolve({ id: emp }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    return { daysWorked: Number(body.data.daysWorked), unpaid: Number(body.data.unpaidLeaveDays) };
  }

  it("T3b ABSENT and UNPAID_LEAVE workdays are unpaid days (punch-based employee)", async () => {
    const sched = await schedule("sa", MON_FRI);
    const emp = await employee("pa");
    await assign(emp, sched);
    // Mon 2 Nov to Fri 6 Nov 2026
    await dtr(emp, "2026-11-02", "PRESENT", 480);
    await dtr(emp, "2026-11-03", "ABSENT");
    await dtr(emp, "2026-11-04", "UNPAID_LEAVE");
    await dtr(emp, "2026-11-05", "PRESENT", 480);
    await dtr(emp, "2026-11-06", "PRESENT", 480);
    expect(await runAggregate(emp)).toEqual({ daysWorked: 3, unpaid: 2 });
  });

  it("T3b attendance-exempt: only scheduled workdays count, rest days are never unpaid", async () => {
    const sched = await schedule("sx", MON_FRI);
    const emp = await employee("px", { exempt: true });
    await assign(emp, sched);
    await dtr(emp, "2026-11-04", "UNPAID_LEAVE"); // Wednesday
    // Mon to Fri = 5 workdays; Sat 7 and Sun 8 Nov are rest days
    expect(await runAggregate(emp)).toEqual({ daysWorked: 4, unpaid: 1 });
  });
});

describe("1.8 run membership and pairing refusals", () => {
  it("G3 a REGULAR run pays only its own pay cycle; other run types keep their selection", () => {
    const people = [
      { id: "m", payFrequency: "SEMI_MONTHLY" as const },
      { id: "w", payFrequency: "WEEKLY" as const },
      { id: "d", payFrequency: "DAILY" as const },
    ];
    expect(onRunCycle(people, "REGULAR", "SEMI_MONTHLY").map((e) => e.id)).toEqual(["m"]);
    expect(onRunCycle(people, "REGULAR", "WEEKLY").map((e) => e.id)).toEqual(["w"]);
    for (const rt of ["OFF_CYCLE", "FINAL_PAY", "YEAR_END"] as const) {
      expect(onRunCycle(people, rt, "SEMI_MONTHLY").map((e) => e.id), rt).toEqual(["m", "w", "d"]);
    }
  });

  it("T6 the employee form refuses pairs 1.8 cannot pay, and accepts the rest", () => {
    const base = {
      firstName: "U18", lastName: "Pair", mobileNumber: "", bankAccountNumber: "", branchId: "b",
      hireDate: "2026-11-02", basicSalary: 20000,
    };
    const refused: [string, string][] = [
      ["MONTHLY", "WEEKLY"], ["MONTHLY", "DAILY"], ["MONTHLY", "BI_WEEKLY"],
      ["WEEKLY", "SEMI_MONTHLY"], ["WEEKLY", "MONTHLY"],
    ];
    for (const [salaryType, payFrequency] of refused) {
      const r = createEmployeeSchema.safeParse({ ...base, salaryType, payFrequency });
      expect(r.success, `${salaryType} x ${payFrequency}`).toBe(false);
      expect(JSON.stringify(r.error?.flatten().fieldErrors)).toMatch(/cannot be paid on a/);
    }
    const accepted: [string, string][] = [
      ["MONTHLY", "SEMI_MONTHLY"], ["MONTHLY", "MONTHLY"], ["WEEKLY", "WEEKLY"], ["WEEKLY", "BI_WEEKLY"],
      ["DAILY", "DAILY"], ["DAILY", "WEEKLY"], ["DAILY", "SEMI_MONTHLY"],
    ];
    for (const [salaryType, payFrequency] of accepted) {
      const r = createEmployeeSchema.safeParse({ ...base, salaryType, payFrequency });
      const pairErr = JSON.stringify(r.success ? {} : r.error.flatten().fieldErrors);
      expect(pairErr, `${salaryType} x ${payFrequency}`).not.toMatch(/cannot be paid on a/);
    }
  });
});
