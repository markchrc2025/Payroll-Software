/**
 * PAY-152 against real Postgres. One payslip, Nov 1-15 2026: basic
 * 33,300.00 (net 28,610.50, as in PAY-203). Pay before Sentire: 120,000.00
 * basic. A second payslip, Oct 16-31, finalized before PAY-152 (no stored
 * accrual): basic 33,300.00.
 *
 *   D1  finalizing a regular run stores each payslip's 13th-month base and
 *       its accrual, 33,300.00 / 12 = 2,775.00 (fails on main: no columns).
 *   D2  the report: accrued to date (33,300.00 + 33,300.00 + 120,000.00) /
 *       12 = 15,550.00, a payslip with no stored accrual worked out the same
 *       way, and the Nov journal line.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p152t${sfx}`;
const id = (s: string) => `p152${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { finalizeRun } from "@/lib/payroll/persist";
import { GET } from "@/app/api/payroll/reports/thirteenth-accrual/route";

describeDb("PAY-152 13th month accrual (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const addRun = async (key: string, start: string, end: string, status: string) => {
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "finalizedAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5, $6, now())`, [id(key), T, start, end, status, status === "FINALIZED" ? end : null]);
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true,
         3330000, 3330000, 182500, 3147500, 286450, 100000, 62500, 20000, 2861050, '[]', '[]', '{}', '{}', now())`,
      [id(`${key}s`), T, id(key), id("ana")],
    );
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Accrual Co', $2, now())`, [T, `P152${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2025-01-06', now())`, [id("ana"), T]);
    await q(`INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "basicPayEarnedCents", "updatedAt") VALUES ($1, $2, $3, 2026, 'PRIOR_PAYROLL', 12000000, now())`, [id("open"), T, id("ana")]);
    await addRun("oct", "2026-10-16", "2026-10-31", "FINALIZED");
    await addRun("nov", "2026-11-01", "2026-11-15", "DRAFT");
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeeYtdOpening", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 finalize records the base and the accrual", async () => {
    await finalizeRun(T, id("nov"), null);
    const r = (await q(`SELECT "thirteenthAccrualBasisCents"::text b, "thirteenthAccrualCents"::text a FROM "PayrollSheet" WHERE id = $1`, [id("novs")])).rows[0];
    expect(r).toEqual({ b: "3330000", a: "277500" });
    const old = (await q(`SELECT "thirteenthAccrualCents" a FROM "PayrollSheet" WHERE id = $1`, [id("octs")])).rows[0];
    expect(old.a).toBeNull();
  });

  it("D2 the report", async () => {
    const res = await GET(new NextRequest("http://localhost/api/payroll/reports/thirteenth-accrual?year=2026"));
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.asOf).toBe("2026-11-15");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      runs: 2, basisFromRunsCents: "6660000", basisFromOpeningCents: "12000000", accruedToDateCents: "1555000",
      monthlyBasicCents: "6660000", projectedPayoutCents: (1555000n + 6660000n * 3n / 24n).toString(),
    });
    expect(data.journal.find((j: { month: number }) => j.month === 11).accrualCents).toBe("277500");
    expect(data.journal.find((j: { month: number }) => j.month === 10).accrualCents).toBe("277500");
  });
});
