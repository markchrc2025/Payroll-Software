/**
 * PAY-219 against real Postgres: drill-down analytics.
 *
 *   D1  payroll cost by department, then by employee, then the employee's
 *       payslips; finalized runs in the period only; employer share counts
 *       SSS ER, EC, PhilHealth ER and Pag-IBIG ER (fails on main: no route).
 *   D2  filters: branch and employment type narrow the employees; a period
 *       outside the runs shows nothing.
 *   D3  overtime, attendance and leave from DTR days (rejected days left out),
 *       with the employee's days and leave balances.
 *   D4  hires, separations and turnover; contributions and tax; 13th month.
 *   D5  a role with Reports but not Payroll sees department totals but not
 *       pay per employee; with Payroll it does. Bad input is refused.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `adt${sfx}`;
const id = (k: string) => `ad${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET } from "@/app/api/analytics/drill/route";

const call = async (qs: string) => {
  const res = await GET(new NextRequest(`http://x/api/analytics/drill?${qs}`));
  return { status: res.status, body: await res.json() };
};
const P = "from=2026-01&to=2026-03";

describeDb("PAY-219 drill-down analytics (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const emp = (k: string, first: string, dept: string | null, branch: string | null, type: string, hire: string, status = "REGULAR", resigned: string | null = null) =>
    q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "departmentId", "branchId", "employmentType", "hireDate", "employmentStatus", "resignationDate", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Cruz', $5, $6, $7::"EmploymentType", $8, $9::"EmploymentStatus", $10, now())`,
      [id(k), T, k.toUpperCase(), first, dept && id(dept), branch && id(branch), type, hire, status, resigned]);
  const book = (k: string, start: string, end: string, status = "FINALIZED") =>
    q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5::"PayrollBookStatus", now())`,
      [id(`b${k}`), T, start, end, status]);
  const sheet = (b: string, e: string, f: { gross: number; net: number; sssEe?: number; sssEr?: number; ec?: number; phEe?: number; phEr?: number; piEe?: number; piEr?: number; tax?: number; ot?: number; th?: number }) =>
    q(`INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "grossCompensationCents", "netPayCents", "sssEeCents", "sssErCents", "sssEcCents", "philhealthEeCents", "philhealthErCents",
         "pagibigEeCents", "pagibigErCents", "withholdingTaxCents", "otPayCents", "thirteenthAccrualBasisCents", "thirteenthAccrualCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 3000000, 261, true, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, '[]', '[]', '{}', '{}', now())`,
      [id(`s${b}${e}`), T, id(`b${b}`), id(e), f.gross, f.net, f.sssEe ?? 0, f.sssEr ?? 0, f.ec ?? 0, f.phEe ?? 0, f.phEr ?? 0, f.piEe ?? 0, f.piEr ?? 0, f.tax ?? 0, f.ot ?? 0,
        f.th != null ? f.gross : null, f.th ?? null]);
  const day = (e: string, date: string, f: { status?: string; late?: number; ut?: number; ot?: number; worked?: number; missing?: boolean; approval?: string }) =>
    q(`INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "lateMinutes", "undertimeMinutes", "otMinutes", "hasMissingPunch", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"DTRDayStatus", $6, $7, $8, $9, $10, $11::"DTRStatus", now())`,
      [id(`d${e}${date}`), T, id(e), date, f.status ?? "PRESENT", f.worked ?? 480, f.late ?? 0, f.ut ?? 0, f.ot ?? 0, f.missing ?? false, f.approval ?? "APPROVED"]);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala Foods', $2, now())`, [T, `AD${sfx}`.toUpperCase()]);
    for (const [k, n] of [["ops", "Operations"], ["fin", "Finance"]]) await q(`INSERT INTO "Department" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $3, now())`, [id(k), T, n]);
    for (const [k, n] of [["mk", "Marikina"], ["pa", "Pasig"]]) await q(`INSERT INTO "Branch" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $3, now())`, [id(k), T, n]);
    await emp("ana", "Ana", "ops", "mk", "FULL_TIME", "2024-01-08");
    await emp("ben", "Ben", "ops", "pa", "PART_TIME", "2026-02-02");
    await emp("cel", "Cel", "fin", "mk", "FULL_TIME", "2023-05-01", "RESIGNED", "2026-03-15");
    await emp("dan", "Dan", null, "mk", "FULL_TIME", "2025-06-01");

    await book("1", "2026-01-01", "2026-01-15");
    await book("2", "2026-02-16", "2026-02-28");
    await book("3", "2026-03-01", "2026-03-15", "DRAFT");
    await book("4", "2025-12-16", "2025-12-31");
    await sheet("1", "ana", { gross: 2000000, net: 1700000, sssEe: 100000, sssEr: 200000, ec: 1000, phEe: 50000, phEr: 50000, piEe: 20000, piEr: 20000, tax: 80000, ot: 50000, th: 166667 });
    await sheet("2", "ana", { gross: 2000000, net: 1700000, sssEe: 100000, sssEr: 200000, ec: 1000, phEe: 50000, phEr: 50000, piEe: 20000, piEr: 20000, tax: 80000, th: 166667 });
    await sheet("2", "ben", { gross: 600000, net: 580000, sssEr: 30000, ec: 1000 });
    await sheet("1", "cel", { gross: 3000000, net: 2500000, sssEr: 200000, ec: 3000, tax: 300000 });
    await sheet("3", "ana", { gross: 9900000, net: 9900000 }); // draft: never counted
    await sheet("4", "ana", { gross: 7700000, net: 7700000 }); // before the period

    await day("ana", "2026-01-05", { late: 15, ot: 120 });
    await day("ana", "2026-01-06", { ut: 30, missing: true });
    await day("ana", "2026-01-07", { status: "ABSENT", worked: 0 });
    await day("ana", "2026-01-08", { status: "PAID_LEAVE", worked: 0 });
    await day("ana", "2026-01-09", { late: 600, approval: "REJECTED" }); // rejected: left out
    await day("ben", "2026-02-03", { ot: 60 });
    await day("ben", "2026-02-04", { status: "UNPAID_LEAVE", worked: 0 });

    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation Leave', 'VL', 1.25, now())`, [id("vl"), T]);
    await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, "openingBalance", earned, used, forfeited, "convertedToCash", "updatedAt")
             VALUES ($1, $2, $3, $4, 2026, 2, 3.75, 1, 0, 0, now())`, [id("lb"), T, id("ana"), id("vl")]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500));
    await q(`ALTER TABLE "PayrollSheet" DISABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" DISABLE TRIGGER USER`);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "PayrollSheet" ENABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" ENABLE TRIGGER USER`);
    await q(`DELETE FROM "DTRRecord" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "LeaveBalance" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "LeaveType" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Department" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Branch" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = $1`, [id("role")]);
    await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 payroll cost: department, then employee, then payslips", async () => {
    const co = (await call(`topic=payroll&${P}`)).body.data;
    expect(co.level).toBe("company");
    const ops = co.rows.find((r: { id: string }) => r.id === id("ops"));
    // Ana 2 finalized sheets in range, Ben 1. ER = SSS ER + EC + PH ER + PI ER.
    expect(ops.values).toMatchObject({ gross: "4600000", employerShare: "573000", totalCost: "5173000", net: "3980000", paid: 2, costPerHead: "2586500" });
    expect(co.rows.find((r: { id: string }) => r.id === "none").name).toBe("No department");
    expect(co.totals).toMatchObject({ gross: "7600000", paid: 3 });

    const dep = (await call(`topic=payroll&${P}&departmentId=${id("ops")}`)).body.data;
    expect(dep.level).toBe("department");
    expect(dep.rows.map((r: { name: string }) => r.name)).toEqual(["Cruz, Ana", "Cruz, Ben"]);
    expect(dep.rows[0].values).toMatchObject({ gross: "4000000", employerShare: "542000", paid: 1 });

    const one = (await call(`topic=payroll&${P}&departmentId=${id("ops")}&employeeId=${id("ana")}`)).body.data;
    expect(one.level).toBe("employee");
    expect(one.detail.kind).toBe("payslips");
    expect(one.detail.rows.map((r: { label: string }) => r.label)).toEqual(["2026-01-01 to 2026-01-15", "2026-02-16 to 2026-02-28"]);
    expect(one.detail.rows[0].href).toBe(`/payroll/${id("b1")}`);
    expect(one.detail.rows[0].values).toMatchObject({ gross: "2000000", employerShare: "271000", totalCost: "2271000" });
  });

  it("D2 filters narrow the employees; an empty period shows nothing", async () => {
    const mk = (await call(`topic=payroll&${P}&branchId=${id("mk")}`)).body.data;
    expect(mk.totals).toMatchObject({ gross: "7000000", paid: 2 });
    const pt = (await call(`topic=payroll&${P}&employmentType=PART_TIME`)).body.data;
    expect(pt.totals).toMatchObject({ gross: "600000", paid: 1 });
    const none = (await call(`topic=payroll&from=2027-01&to=2027-02`)).body.data;
    expect(none.totals).toMatchObject({ gross: "0", paid: 0, costPerHead: null });
  });

  it("D3 overtime, attendance and leave from the days", async () => {
    const ot = (await call(`topic=overtime&${P}`)).body.data;
    expect(ot.totals).toMatchObject({ otMinutes: 180, otDays: 2, otPay: "50000" });
    const att = (await call(`topic=attendance&${P}&departmentId=${id("ops")}&employeeId=${id("ana")}`)).body.data;
    expect(att.totals).toMatchObject({ lateMinutes: 15, undertimeMinutes: 30, absentDays: 1, missingPunchDays: 1, presentDays: 2 });
    expect(att.detail.rows.map((r: { label: string }) => r.label)).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
    const lv = (await call(`topic=leave&${P}&departmentId=${id("ops")}`)).body.data;
    const ana = lv.rows.find((r: { id: string }) => r.id === id("ana"));
    expect(ana.values).toMatchObject({ paidLeaveDays: 1, unpaidLeaveDays: 0, balanceDays: 4.75 });
    expect(lv.rows.find((r: { id: string }) => r.id === id("ben")).values).toMatchObject({ unpaidLeaveDays: 1 });
    const mine = (await call(`topic=leave&${P}&employeeId=${id("ana")}`)).body.data;
    expect(mine.detail2.rows[0]).toMatchObject({ label: "Vacation Leave", values: { earned: 5.75, used: 1, left: 4.75 } });
  });

  it("D4 hires and separations, contributions and tax, 13th month", async () => {
    const hc = (await call(`topic=headcount&${P}`)).body.data;
    // At start: Ana, Cel, Dan (3). Ben hired Feb; Cel resigned 15 Mar. At end: Ana, Ben, Dan (3).
    expect(hc.totals).toMatchObject({ startActive: 3, hires: 1, separations: 1, endActive: 3, turnoverPct: 33.3 });
    const cel = (await call(`topic=headcount&${P}&employeeId=${id("cel")}`)).body.data;
    expect(cel.detail.rows.map((r: { label: string; sub: string }) => `${r.label} ${r.sub}`)).toEqual(["Hired 2023-05-01", "Status resigned", "Separated 2026-03-15"]);
    const st = (await call(`topic=statutory&${P}&departmentId=${id("ops")}`)).body.data;
    expect(st.totals).toMatchObject({ sssEe: "200000", sssEr: "433000", phEe: "100000", phEr: "100000", piEe: "40000", piEr: "40000", wht: "160000", total: "1073000" });
    const th = (await call(`topic=thirteenth&${P}`)).body.data;
    expect(th.totals).toMatchObject({ basis: "4000000", accrual: "333334" });
  });

  it("D5 Reports without Payroll stops at department totals; bad input is refused", async () => {
    await q(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Report reader', now())`, [id("role"), T]);
    await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'REPORTS' AND action = 'READ'`, [id("role")]);
    Object.assign(auth, { systemRole: "TENANT_USER", roleId: id("role") });
    try {
      expect((await call(`topic=payroll&${P}`)).status).toBe(200);
      expect((await call(`topic=payroll&${P}&departmentId=${id("ops")}`)).status).toBe(403);
      expect((await call(`topic=attendance&${P}&departmentId=${id("ops")}`)).status).toBe(200);
      await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'PAYROLL' AND action = 'READ'`, [id("role")]);
      expect((await call(`topic=payroll&${P}&departmentId=${id("ops")}`)).status).toBe(200);
    } finally {
      Object.assign(auth, { systemRole: "SUPER_ADMIN", roleId: null });
    }
    expect((await call(`topic=nope&${P}`)).status).toBe(400);
    expect((await call(`topic=payroll&from=2026-13&to=2026-01`)).status).toBe(400);
    expect((await call(`topic=payroll&from=2026-03&to=2026-01`)).status).toBe(400);
    expect((await call(`topic=payroll&from=2020-01&to=2026-01`)).status).toBe(400);
  });
});
