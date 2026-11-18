/**
 * PAY-173 (staging chain test, 17 Nov 2026): Ana did not come in on a
 * scheduled workday and had no punches, leave or anything filed. The day had
 * no DTR row, payroll skipped it, and a monthly-paid employee was paid for it
 * (₱1,379.31 not docked).
 *
 * Period Mon 2 Nov to Sun 15 Nov 2026, Mon to Fri schedule, hired 3 Nov.
 *
 *   N1  (T1) a scheduled workday with no DTR at all counts as one unpaid day.
 *   N2  not counted as absent: rest days, a holiday, a day with an unapproved
 *       DTR row, days before the hire date, today and days still to come.
 *   N3  the PeriodInput note says how many days were counted this way.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { withTenant } from "@/lib/with-tenant";
import { aggregateApprovedDtr } from "@/lib/payroll/dtr-aggregate";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p173t${sfx}`;
const id = (s: string) => `p173${s}${sfx}`;
const A = id("a");

describeDb("PAY-173 a scheduled workday with no DTR is an absence (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const day = (ymd: string, status: "APPROVED" | "PENDING") =>
    q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4::date, 'PRESENT', 480, $5, now())`,
      [id(ymd), T, A, ymd, status],
    );
  const run = () =>
    withTenant(T, (tx) =>
      aggregateApprovedDtr(tx, {
        tenantId: T,
        employeeId: A,
        periodStartDate: new Date("2026-11-02T00:00:00.000Z"),
        periodEndDate: new Date("2026-11-15T23:59:59.999Z"),
        // Thursday 12 Nov, 10:00 in Manila: 12 Nov to 15 Nov are not over yet.
        now: new Date("2026-11-12T02:00:00.000Z"),
      }),
    );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P173${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P173', 'Test', '2026-11-03', now())`,
      [A, T, `P173-${sfx}`],
    );
    await q(
      `INSERT INTO "Holiday" (id, "tenantId", name, category, date, "updatedAt")
       VALUES ($1, $2, 'Test special day', 'SPECIAL_NON_WORKING', '2026-11-06', now())`,
      [id("h"), T],
    );
    // Mon 2 Nov: before hire. Tue 3, Thu 5: approved. Fri 6: holiday.
    // Mon 9: approved. Tue 10: pending row. Wed 4 and Wed 11: nothing at all.
    await day("2026-11-03", "APPROVED");
    await day("2026-11-05", "APPROVED");
    await day("2026-11-09", "APPROVED");
    await day("2026-11-10", "PENDING");
  });

  afterAll(async () => {
    for (const t of ["DTRRecord", "Holiday"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("N1 (T1) and N2: only Wed 4 and Wed 11 Nov count as absences", async () => {
    const r = await run();
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.data.daysWorked).toBe("3");
    expect(r.data.unpaidLeaveDays).toBe("2");
  });

  it("N3 the note says how many days were counted as absent with no DTR", async () => {
    const r = await run();
    if (r.status !== "OK") throw new Error(r.status);
    expect(r.data.notes).toMatch(/2 scheduled workday\(s\) with no DTR counted as absent/);
  });
});
