/**
 * PAY-60 (plan 1.5, S1): the company's 13th-month basis setting (Pay Rules)
 * was read by no computation: "Include Regular Allowances" paid the same as
 * "Strict DOLE".
 *
 * Employee: monthly 30,000.00. One finalized regular run, 16 to 31 Oct 2026,
 * with: Rice 2,000.00 (ticked "13th-Month Pay basis"), Transport 1,000.00
 * (not ticked), a 5,000.00 bonus (ticked, but a bonus never counts).
 * Basic on the run: 15,000.00.
 *
 *   B1  Strict DOLE: the Year-End run pays 15,000 / 12 = 1,250.00; the ticks
 *       are ignored.
 *   B2  (T1) Include Regular Allowances: (15,000 + 2,000) / 12 = 1,416.66; the
 *       breakdown names the basis and the allowances counted.
 *   B3  a 13th month paid in a regular run (1 to 15 Nov, 4 periods projected)
 *       counts the ticked allowance for this run and its projection:
 *       (15,000 + 2,000 + 4 x 15,000 + 4 x 2,000) / 12 = 7,083.33.
 *   B4  Pay Rules says which earnings count.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun, finalizeRun } from "@/lib/payroll/persist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p60t${sfx}`;
const id = (s: string) => `p60${s}${sfx}`;
const E = id("emp");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-60 the 13th-month basis setting is used (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const thirteenth = async (book: string) =>
    (await q(`SELECT "thirteenthMonthBreakdown" b FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`, [book, E])).rows[0].b as
      { basis: string; dueCents: string; allowancesCents?: string; totalBasicCents: string };
  const drop = async (book: string) => {
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [book]);
  };
  const yearEnd = async () =>
    (await createDraftRun({ tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-31"), cycle: "SEMI_MONTHLY", runType: "YEAR_END", employeeIds: [E] })).id;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P60${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p60-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P60', $1, '2025-01-06', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    const comp = async (key: string, kind: string, amount: number, counts: boolean, isBonus = false, endDate: string | null = null) => {
      await q(
        `INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "includeIn13thMonth", "isBonus", "updatedAt")
         VALUES ($1, $2, $3, $3, $4::"PayComponentKind", 'TAXABLE', $5, $6, now())`,
        [id(key), T, key.toUpperCase(), kind, counts, isBonus],
      );
      await q(
        `INSERT INTO "EmployeePayComponent" (id, "tenantId", "employeeId", "payComponentId", "amountCents", "effectiveFrom", "endDate", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, '2026-10-16', $6, now())`,
        [`${id(key)}-a`, T, E, id(key), amount, endDate],
      );
    };
    await comp("rice", "ALLOWANCE", 200_000, true);
    await comp("transpo", "ALLOWANCE", 100_000, false, false, "2026-10-31");
    await comp("perf", "BONUS", 500_000, true, true, "2026-10-31");
    const oct = await createDraftRun({ tenantId: T, periodStart: d("2026-10-16"), periodEnd: d("2026-10-31"), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
    await finalizeRun(T, oct.id, null);
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeePayComponent", "PayComponent", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("B1 Strict DOLE: basic pay only", async () => {
    const book = await yearEnd();
    const t = await thirteenth(book);
    expect(t).toMatchObject({ basis: "STRICT_DOLE", dueCents: "125000", totalBasicCents: "1500000" });
    expect(t.allowancesCents).toBeUndefined();
    await drop(book);
  });

  it("B2 (T1) Include Regular Allowances: basic plus the ticked allowance", async () => {
    await q(`UPDATE "Tenant" SET "thirteenthMonthBasis" = 'INCLUDE_ALLOWANCES' WHERE id = $1`, [T]);
    const book = await yearEnd();
    expect(await thirteenth(book)).toMatchObject({ basis: "INCLUDE_ALLOWANCES", allowancesCents: "200000", totalBasicCents: "1700000", dueCents: "141666" });
    await drop(book);
  });

  it("B3 a 13th month paid in a regular run counts the allowance for this run and its projection", async () => {
    const nov = await createDraftRun({ tenantId: T, periodStart: d("2026-11-01"), periodEnd: d("2026-11-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR", includeThirteenthMonth: true });
    expect(await thirteenth(nov.id)).toMatchObject({ basis: "INCLUDE_ALLOWANCES", allowancesCents: "1000000", totalBasicCents: "8500000", dueCents: "708333" });
  });
});

describe("PAY-60 Pay Rules wording", () => {
  it("B4 the setting says which earnings count", () => {
    const page = readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8");
    expect(page).toMatch(/earnings ticked \\"13th-Month Pay basis\\" in Pay Components/);
    expect(page).toMatch(/P\.D\. 851/);
  });
});
