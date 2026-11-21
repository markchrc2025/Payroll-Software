/**
 * Wave E2 (PAY-215) against real Postgres: the leave year end.
 *
 *   D1  the preview: pending requests are held back; days carry over up to
 *       the cap; the rest is converted to cash at the daily rate (decision 8:
 *       for vacation leave up to 10 days are de minimis, the rest taxable) or
 *       forfeited (fails on main: no route).
 *   D2  applying writes CARRYOVER, CONVERSION and FORFEITURE transactions,
 *       the balances and the run's adjustments; applying again changes nothing.
 *   D3  converted leave needs a draft run that is not a final pay run.
 *   D4  carried days expire at the end of the month the policy says, less
 *       the days used in the new year; not before.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wyt${sfx}`;
const id = (k: string) => `wy${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as preview, POST as run } from "@/app/api/leave-year-end/route";
import { POST as expire } from "@/app/api/leave-year-end/expire/route";

const jreq = (url: string, body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body) });

describeDb("Wave E2 leave year end (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const bal = async (emp: string, lt: string, year: number) => (await q(
    `SELECT "openingBalance"::text o, forfeited::text f, "convertedToCash"::text c FROM "LeaveBalance" WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND year = $3`, [emp, lt, year])).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = id("u");
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WY${sfx}`.toUpperCase()]);
    for (const [e, num] of [[id("ana"), "A-1"], [id("ben"), "B-1"]]) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "updatedAt") VALUES ($1, $2, $3, 'X', $3, '2024-01-08', 'REGULAR', now())`, [e, T, num]);
    }
    await q(`INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt") VALUES ($1, $2, $3, '2024-01-08', 3000000, 'MONTHLY', now())`, [id("term"), T, id("ana")]);
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.5, now()), ($3, $2, 'Sick', 'SL', 1.25, now())`, [id("vl"), T, id("sl")]);
    await q(`INSERT INTO "LeaveEarningPolicy" (id, "tenantId", name, "leaveTypeId", "accrualFrequency", "accrualAmount", "carryOverCap", "convertUnusedToCash", "vacationLeave", "effectiveFrom", "updatedAt")
             VALUES ($1, $2, 'Vacation', $3, 'MONTHLY', 1.5, 5, true, true, '2026-01-01', now())`, [id("pv"), T, id("vl")]);
    await q(`INSERT INTO "LeaveEarningPolicy" (id, "tenantId", name, "leaveTypeId", "accrualFrequency", "accrualAmount", "carryOverCap", "expiresAfterMonths", "effectiveFrom", "updatedAt")
             VALUES ($1, $2, 'Sick', $3, 'MONTHLY', 1.25, 3, 3, '2026-01-01', now())`, [id("ps"), T, id("sl")]);
    await q(`INSERT INTO "LeaveEntitlement" (id, "tenantId", "employeeId", "leaveTypeId", "policyId", "startDate", "accrualAmount", "accrualFrequency", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, '2026-01-01', 1.5, 'MONTHLY', now()), ($6, $2, $7, $8, $9, '2026-01-01', 1.25, 'MONTHLY', now())`,
      [id("ea"), T, id("ana"), id("vl"), id("pv"), id("eb"), id("ben"), id("sl"), id("ps")]);
    await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, earned, used, "updatedAt") VALUES ($1, $2, $3, $4, 2026, 18, 0, now()), ($5, $2, $6, $7, 2026, 5, 1, now())`,
      [id("ba"), T, id("ana"), id("vl"), id("bb"), id("ben"), id("sl")]);
    await q(`INSERT INTO "LeaveTransaction" (id, "tenantId", "employeeId", "leaveTypeId", "leaveBalanceId", type, amount, "paidUnits", "approvalStatus", "startDate", "endDate") VALUES ($1, $2, $3, $4, $5, 'USAGE', 1, 1, 'PENDING', '2026-12-29', '2026-12-29')`,
      [id("pend"), T, id("ana"), id("vl"), id("ba")]);
    for (const [k, type] of [["run", "YEAR_END"], ["fp", "FINAL_PAY"]]) {
      await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, '2026-12-16', '2026-12-31', 'SEMI_MONTHLY', $3::"PayrollRunType", 'DRAFT', now())`, [id(k), T, type]);
    }
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["PayrollAdjustment", "PayrollBook", "LeaveTransaction", "LeaveBalance", "LeaveEntitlement", "LeaveEarningPolicy", "LeaveType", "EmploymentTerm", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the preview", async () => {
    const rows = (await (await preview(new NextRequest("http://x/api/leave-year-end?year=2026"))).json()).data;
    expect(rows.map((r: Record<string, unknown>) => [r.employeeNumber, r.leaveType, r.available, r.heldBack, r.carry, r.convert, r.forfeit, r.cashCents, r.deMinimisCents, r.taxableCents])).toEqual([
      // ₱30,000 a month, 261 days: ₱1,379.31 a day. 12 days converted, 10 de minimis.
      ["A-1", "Vacation", "18.0000", "1.0000", "5.0000", "12.0000", "0.0000", "1655172", "1379310", "275862"],
      ["B-1", "Sick", "4.0000", "0.0000", "3.0000", "0.0000", "1.0000", "0", "0", "0"],
    ]);
  });

  it("D3 converted leave needs a draft run, not a final pay run", async () => {
    expect((await run(jreq("http://x", { year: 2026 }))).status).toBe(422);
    expect((await run(jreq("http://x", { year: 2026, payrollRunId: id("fp") }))).status).toBe(422);
  });

  it("D2 applying, and again", async () => {
    const res = await run(jreq("http://x", { year: 2026, payrollRunId: id("run") }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ processed: 2, cashCents: "1655172" });
    expect(await bal(id("ana"), id("vl"), 2026)).toEqual({ o: "0.0000", f: "0.0000", c: "12.0000" });
    expect(await bal(id("ana"), id("vl"), 2027)).toMatchObject({ o: "5.0000" });
    expect(await bal(id("ben"), id("sl"), 2026)).toEqual({ o: "0.0000", f: "1.0000", c: "0.0000" });
    expect(await bal(id("ben"), id("sl"), 2027)).toMatchObject({ o: "3.0000" });
    const adj = (await q(`SELECT "amountCents"::text a, "isTaxable" t FROM "PayrollAdjustment" WHERE "payrollBookId" = $1 ORDER BY "isTaxable"`, [id("run")])).rows;
    expect(adj).toEqual([{ a: "1379310", t: false }, { a: "275862", t: true }]);
    const again = await run(jreq("http://x", { year: 2026, payrollRunId: id("run") }));
    expect((await again.json()).data).toEqual({ processed: 0, cashCents: "0" });
    expect((await q(`SELECT count(*)::int n FROM "PayrollAdjustment" WHERE "payrollBookId" = $1`, [id("run")])).rows[0].n).toBe(2);
  });

  it("D4 carried days expire", async () => {
    await q(`UPDATE "LeaveBalance" SET used = 1 WHERE "employeeId" = $1 AND year = 2027`, [id("ben")]);
    const early = await expire(jreq("http://x", { asOf: "2027-03-30" }));
    expect((await early.json()).data).toEqual({ expired: 0 });
    const due = await expire(jreq("http://x", { asOf: "2027-04-01" }));
    expect((await due.json()).data).toEqual({ expired: 1 });
    expect(await bal(id("ben"), id("sl"), 2027)).toMatchObject({ f: "2.0000" });
    expect((await (await expire(jreq("http://x", { asOf: "2027-05-01" }))).json()).data).toEqual({ expired: 0 });
  });
});
