/**
 * Wave D (PAY-214) against real Postgres: the four HR reports.
 *
 *   D1  Expense Transaction: claims in the date range (drafts left out), totals
 *       by category and by type, and the tie of a run's paid claims to its
 *       register: Ties, or Differs by the gap (fails on main: no route).
 *   D2  Leave Transaction: the running balance from the entered opening, only
 *       approved leave counted, and the closing checked against the balance
 *       on file: Matches, or Differs by the gap.
 *   D3  Leave Entitlement: earned, used, pending and available as of a date,
 *       the next accrual, and an employee past a year of service with no
 *       entitlement flagged.
 *   D4  Time Clock: punches per Manila day with first in and last out,
 *       a missing time out, a punch outside the geofence, and a manual DTR
 *       edit with who made it.
 *   D5  each report needs its own permission.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wdrt${sfx}`;
const U = `wdru${sfx}`;
const ADMIN = `wdra${sfx}`;
const LEAVER = `wdrl${sfx}`;
const E = { ana: `wdea${sfx}`, ben: `wdeb${sfx}`, new: `wden${sfx}` };
const id = (k: string) => `wdr${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as report } from "@/app/api/reports/hr/[kind]/route";

type R = { rows: Record<string, string | null>[]; sections: { title: string; rows: Record<string, string | null>[] }[] };
const get = async (kind: string, qs: string) => {
  const res = await report(new NextRequest(`http://localhost/api/reports/hr/${kind}?${qs}`), { params: Promise.resolve({ kind }) });
  return { status: res.status, data: (await res.json()).data as R };
};

describeDb("Wave D HR reports (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = U; auth.roleId = ADMIN;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WDR${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    await q(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Admin', now()), ($3, $2, 'Leave only', now())`, [ADMIN, T, LEAVER]);
    await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission"`, [ADMIN]);
    await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'LEAVES' AND action = 'READ'`, [LEAVER]);
    for (const [eid, num, last, hire] of [[E.ana, "A-1", "Abad", "2024-01-08"], [E.ben, "B-1", "Bautista", "2025-06-02"], [E.new, "N-1", "Nieva", "2026-10-01"]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "updatedAt") VALUES ($1, $2, $3, 'X', $4, $5, 'REGULAR', now())`, [eid, T, num, last, hire]);
    }
    // Expense: a run that paid two claims, with a register that shows one.
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "controlNumber", "finalizedAt", "updatedAt")
             VALUES ($1, $2, '2026-11-01', '2026-11-15', 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', 'PR-2026-0001', '2026-11-16', now())`, [id("book"), T]);
    await q(`INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "expenseClaimsApplied", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 2000000, 261, true,
         1000000, 1000000, 0, 1000000, 0, 0, 0, 0, 1000000, '[]', '[]', '{}', '{}', $5, now())`,
      [id("sheet"), T, id("book"), E.ana, JSON.stringify([{ id: id("x1"), amountCents: "50000" }])]);
    const claim = (k: string, emp: string, cents: number, date: string, status: string, cat: string, book: string | null) =>
      q(`INSERT INTO "ExpenseClaim" (id, "tenantId", "employeeId", category, description, "amountCents", "claimDate", status, "paidInBookId", "updatedAt")
         VALUES ($1, $2, $3, $4, 'x', $5, $6, $7::"ExpenseClaimStatus", $8, now())`, [id(k), T, emp, cat, cents, date, status, book]);
    await claim("x1", E.ana, 50000, "2026-11-03", "PAID", "TRANSPORT", id("book"));
    await claim("x2", E.ben, 30000, "2026-11-04", "PAID", "MEALS", id("book"));
    await claim("x3", E.ben, 20000, "2026-11-20", "SUBMITTED", "MEALS", null);
    await claim("x4", E.ben, 99900, "2026-11-21", "DRAFT", "MEALS", null);
    await claim("x5", E.ana, 10000, "2026-10-30", "APPROVED", "TRANSPORT", null);
    // Leave: Ana's vacation 2026.
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.25, now())`, [id("vl"), T]);
    await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, "openingBalance", earned, used, "updatedAt") VALUES ($1, $2, $3, $4, 2026, 2, 2.5, 1, now())`, [id("bal"), T, E.ana, id("vl")]);
    await q(`INSERT INTO "LeaveEntitlement" (id, "tenantId", "employeeId", "leaveTypeId", "startDate", "accrualAmount", "accrualFrequency", "updatedAt") VALUES ($1, $2, $3, $4, '2024-01-08', 1.25, 'MONTHLY', now())`, [id("ent"), T, E.ana, id("vl")]);
    const lt = (k: string, type: string, amount: number, paid: number, status: string, start: string | null, period: string | null, at: string) =>
      q(`INSERT INTO "LeaveTransaction" (id, "tenantId", "employeeId", "leaveTypeId", "leaveBalanceId", type, amount, "paidUnits", "approvalStatus", "startDate", "endDate", "periodKey", "entitlementId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6::"LeaveTransactionType", $7, $8, $9::"ApprovalStatus", $10, $10, $11, $12, $13)`,
        [id(k), T, E.ana, id("vl"), id("bal"), type, amount, paid, status, start, period, period ? id("ent") : null, at]);
    await lt("a1", "ACCRUAL", 1.25, 0, "APPROVED", null, "2026-01", "2026-01-31T16:00:00Z");
    await lt("a2", "ACCRUAL", 1.25, 0, "APPROVED", null, "2026-02", "2026-02-28T16:00:00Z");
    await lt("u1", "USAGE", 1, 1, "APPROVED", "2026-03-02", null, "2026-03-01T01:00:00Z");
    await lt("u2", "USAGE", 2, 2, "PENDING", "2026-12-01", null, "2026-11-20T01:00:00Z");
    // Time clock: Ana in and out on 3 Nov (Manila), Ben in only and outside the fence on 4 Nov.
    const punch = (k: string, emp: string, type: string, at: string, outside: boolean, lat: number | null) =>
      q(`INSERT INTO "AttendanceLog" (id, "tenantId", "employeeId", "punchType", source, "punchedAt", "outsideGeofence", latitude, longitude)
         VALUES ($1, $2, $3, $4::"PunchType", 'ESS', $5, $6, $7, $8)`, [id(k), T, emp, type, at, outside, lat, lat == null ? null : 121.1]);
    await punch("p1", E.ana, "IN", "2026-11-03T00:02:00Z", false, 14.65);
    await punch("p2", E.ana, "OUT", "2026-11-03T09:05:00Z", false, null);
    await punch("p3", E.ben, "IN", "2026-11-03T23:55:00Z", true, 14.7);
    await q(`INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "updatedAt") VALUES ($1, $2, $3, '2026-11-04', now())`, [id("dtr"), T, E.ben]);
    await q(`INSERT INTO "DTRAuditLog" (id, "tenantId", "dtrRecordId", "actorRole", "actorId", "fieldChanged", "newValue", "reasonCode") VALUES ($1, $2, $3, 'SUPERVISOR', $4, 'manual_time_out', '2026-11-04T10:00:00Z', 'FORGOT_CLOCK_OUT')`, [id("aud"), T, id("dtr"), E.ana]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["DTRAuditLog", "DTRRecord", "AttendanceLog", "LeaveTransaction", "LeaveEntitlement", "LeaveBalance", "LeaveType", "ExpenseClaim", "PayrollSheet", "PayrollBook"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]).catch((e) => { throw new Error(`${t}: ${e.message}`); });
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = ANY($1)`, [[ADMIN, LEAVER]]);
    await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 expense transactions", async () => {
    const { data } = await get("expense-transactions", "from=2026-11-01&to=2026-11-30");
    expect(data.rows.map((r) => [r.date, r.employeeNumber, r.amount, r.status])).toEqual([
      ["2026-11-03", "A-1", "500.00", "PAID"], ["2026-11-04", "B-1", "300.00", "PAID"], ["2026-11-20", "B-1", "200.00", "SUBMITTED"],
    ]);
    const cat = data.sections.find((s) => s.title === "Totals by category")!;
    expect(cat.rows.map((r) => [r.label, r.count, r.amount])).toEqual([["MEALS", "2", "500.00"], ["TRANSPORT", "1", "500.00"]]);
    const tie = data.sections.find((s) => s.title === "Tie to the payroll register")!;
    expect(tie.rows).toEqual([expect.objectContaining({ claims: "800.00", register: "500.00", result: "Differs by 300.00" })]);
    await q(`UPDATE "PayrollSheet" SET "expenseClaimsApplied" = $2 WHERE id = $1`, [id("sheet"), JSON.stringify([{ amountCents: "50000" }, { amountCents: "30000" }])]);
    const again = await get("expense-transactions", "from=2026-11-01&to=2026-11-30");
    expect(again.data.sections.find((s) => s.title === "Tie to the payroll register")!.rows[0]!.result).toBe("Ties");
  });

  it("D2 leave transactions with a running balance and the check", async () => {
    const { data } = await get("leave-transactions", "year=2026");
    expect(data.rows.map((r) => [r.type, r.change, r.balance])).toEqual([
      ["Opening (entered)", "2.00", "2.00"], ["ACCRUAL 2026-01", "1.25", "3.25"], ["ACCRUAL 2026-02", "1.25", "4.50"],
      ["USAGE", "-1.00", "3.50"], ["USAGE", "0.00", "3.50"],
    ]);
    expect(data.sections[0]!.rows).toEqual([expect.objectContaining({ closing: "3.50", onFile: "3.50", result: "Matches" })]);
    await q(`UPDATE "LeaveBalance" SET used = 1.5 WHERE id = $1`, [id("bal")]);
    expect((await get("leave-transactions", "year=2026")).data.sections[0]!.rows[0]!.result).toBe("Differs by 0.50");
    await q(`UPDATE "LeaveBalance" SET used = 1 WHERE id = $1`, [id("bal")]);
  });

  it("D3 leave entitlement as of a date", async () => {
    const { data } = await get("leave-entitlement", "asOf=2026-11-21");
    expect(data.rows).toEqual([expect.objectContaining({ employeeNumber: "A-1", entitlement: "1.25 monthly", earned: "4.50", used: "1.00", pending: "2.00", available: "1.50", nextAccrual: "2026-11-30" })]);
    expect(data.sections[0]!.rows.map((r) => r.employeeNumber)).toEqual(["B-1"]);
  });

  it("D4 the time clock", async () => {
    const { data } = await get("time-clock", "from=2026-11-01&to=2026-11-30");
    expect(data.rows.map((r) => [r.date, r.employeeNumber, r.firstIn, r.lastOut, r.issues])).toEqual([
      ["2026-11-03", "A-1", "08:02", "17:05", null],
      ["2026-11-04", "B-1", "07:55", null, "No time out, 1 outside the geofence"],
    ]);
    expect(data.rows[0]!.location).toBe("14.65000, 121.10000");
    expect(data.rows[1]!.manualEdits).toBe("manual time out by X Abad (FORGOT_CLOCK_OUT)");
  });

  it("D5 each report needs its permission", async () => {
    auth.roleId = LEAVER;
    expect((await get("leave-entitlement", "asOf=2026-11-21")).status).toBe(200);
    expect((await get("expense-transactions", "")).status).toBe(403);
    expect((await get("time-clock", "")).status).toBe(403);
    auth.roleId = ADMIN;
  });
});
