/**
 * Wave G2 (PAY-217) against real Postgres: the Annual Salary Statement.
 *
 *   D1  finalized runs only, each in the month its period ends; columns
 *       split gross into basic, premiums, allowances, 13th month and benefits,
 *       and the rest, which sum back to gross; the totals add the months
 *       (fails on main: no route).
 *   D2  the PDF; the employee gets their own in ESS.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wgt${sfx}`;
const id = (k: string) => `wg${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { GET as hr } from "@/app/api/payroll/annual-statement/route";
import { GET as mine } from "@/app/api/ess/salary-statement/route";

describeDb("Wave G2 annual salary statement (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const sheet = async (k: string, start: string, end: string, status: string, f: { base: number; ot: number; allow: number; th: number; gross: number; sss: number; tax: number; net: number }) => {
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5::"PayrollBookStatus", now())`, [id(`b${k}`), T, start, end, status]);
    await q(`INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "otPayCents", "taxableAllowancesCents", "nontaxable13MonthAndBenefitsCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents", "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 3000000, 261, true, $5, $6, $7, $8, $9, 0, $9, $10, $11, 0, 0, $12, '[]', '[]', '{}', '{}', now())`,
      [id(`s${k}`), T, id(`b${k}`), id("ana"), f.base, f.ot, f.allow, f.th, f.gross, f.tax, f.sss, f.net]);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; ess.tenantId = T; ess.employeeId = id("ana");
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala Foods', $2, now())`, [T, `WG${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'A-1', 'Ana', 'Cruz', '2024-01-08', now())`, [id("ana"), T]);
    await sheet("1", "2026-01-01", "2026-01-15", "FINALIZED", { base: 1500000, ot: 50000, allow: 100000, th: 0, gross: 1660000, sss: 50000, tax: 80000, net: 1530000 });
    await sheet("2", "2026-01-16", "2026-01-31", "FINALIZED", { base: 1500000, ot: 0, allow: 100000, th: 0, gross: 1600000, sss: 50000, tax: 70000, net: 1480000 });
    await sheet("3", "2026-12-16", "2026-12-31", "FINALIZED", { base: 1500000, ot: 0, allow: 0, th: 3000000, gross: 4500000, sss: 50000, tax: 70000, net: 4380000 });
    await sheet("4", "2026-02-01", "2026-02-15", "DRAFT", { base: 1500000, ot: 0, allow: 0, th: 0, gross: 1500000, sss: 0, tax: 0, net: 1500000 });
    await sheet("5", "2025-12-16", "2025-12-31", "FINALIZED", { base: 1500000, ot: 0, allow: 0, th: 0, gross: 1500000, sss: 0, tax: 0, net: 1500000 });
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`ALTER TABLE "PayrollSheet" DISABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" DISABLE TRIGGER USER`);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "PayrollSheet" ENABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" ENABLE TRIGGER USER`);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 by month, finalized only", async () => {
    const res = await hr(new NextRequest(`http://x/api/payroll/annual-statement?employeeId=${id("ana")}&year=2026`));
    expect(res.status).toBe(200);
    const st = (await res.json()).data;
    expect(st.runs).toBe(3);
    expect(st.rows[0]).toMatchObject({ month: "January", basic: "3000000", premiums: "50000", allowances: "200000", thirteenth: "0", other: "10000", gross: "3260000", sss: "100000", tax: "150000", net: "3010000" });
    expect(st.rows[1]).toMatchObject({ month: "February", gross: "0" });
    expect(st.rows[11]).toMatchObject({ month: "December", thirteenth: "3000000", gross: "4500000" });
    expect(st.total).toMatchObject({ gross: "7760000", net: "7390000", tax: "220000" });
    for (const r of [...st.rows, st.total]) {
      const parts = ["basic", "premiums", "allowances", "thirteenth", "other"].reduce((a, k) => a + BigInt(r[k]), 0n);
      expect(parts.toString()).toBe(r.gross);
    }
  });

  it("D2 the PDF, and the employee's own in ESS", async () => {
    const pdf = await hr(new NextRequest(`http://x/api/payroll/annual-statement?employeeId=${id("ana")}&year=2026&format=pdf`));
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const own = (await (await mine(new NextRequest("http://x/api/ess/salary-statement?year=2026"))).json()).data;
    expect(own.total.gross).toBe("7760000");
  });
});
