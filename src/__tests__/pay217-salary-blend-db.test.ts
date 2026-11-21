/**
 * Ruling 1 (Mark, 21 Nov 2026) end to end: a draft run reads the salary in
 * force before a change inside its period and pays the days before it at
 * that rate. ₱30,000.00 a month, ₱31,500.00 from 20 Nov 2026; run 16 to 30
 * Nov: (15,000.00 x 4 + 15,750.00 x 11) / 15 = 15,550.00 (fails on main:
 * 15,750.00). An employee with no change is paid the plain half: 15,000.00.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun } from "@/lib/payroll/persist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `psb${sfx}`;
const id = (s: string) => `psb${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("Salary change inside a period, end to end (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `PSB${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR], ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }]];
    for (const [cat, payload] of rules) {
      await q(`INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt") VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`, [id(cat), T, cat, `psb-${cat}`, JSON.stringify(payload)]);
    }
    for (const e of ["ana", "ben"]) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt") VALUES ($1, $2, $1, 'X', $1, '2025-01-06', false, now())`, [id(e), T]);
      await q(`INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt") VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`, [id(`${e}1`), T, id(e)]);
    }
    await q(`INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt") VALUES ($1, $2, $3, '2026-11-20', 3150000, 'MONTHLY', now())`, [id("ana2"), T, id("ana")]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["PayrollSheet", "PayrollBook", "EmploymentTerm", "Employee", "StatutoryRule", "AuditLog"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the days before the change are paid at the old salary", async () => {
    const book = await createDraftRun({ tenantId: T, periodStart: d("2026-11-16"), periodEnd: d("2026-11-30"), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
    const rows = (await q(`SELECT "employeeId", "basePayCents"::text AS b FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book.id])).rows;
    expect(Object.fromEntries(rows.map((r) => [r.employeeId, r.b]))).toEqual({ [id("ana")]: "1555000", [id("ben")]: "1500000" });
  });
});
