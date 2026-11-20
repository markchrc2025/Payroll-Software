/**
 * PAY-174 (found in the staging chain test, 17 Nov 2026): a loan starting
 * 1 December was deducted from the 16 to 31 October payroll. Runs loaded
 * every ACTIVE loan, whatever its start date.
 *
 *   L1  (T1) a run whose period ends before the loan's start date deducts
 *       nothing for it.
 *   L2  a run whose period reaches the start date deducts the installment.
 *   L3  a loan starting on the period's last day is deducted in that run.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun } from "@/lib/payroll/persist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p174t${sfx}`;
const id = (s: string) => `p174${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-174 loans are deducted only from their start date (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const A = id("a");

  async function loanDeduction(start: string, end: string): Promise<bigint> {
    const book = await createDraftRun({ tenantId: T, periodStart: d(start), periodEnd: d(end), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
    const r = await q(`SELECT "loanDeductionsCents"::text AS v FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`, [book.id, A]);
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book.id]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [book.id]);
    return BigInt(r.rows[0].v);
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P174${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p174-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      // Time Clock Needed off: this test is about loans; since PAY-172 a
      // time-clock employee with no DTR is absent on past workdays, which made
      // the 16-30 Nov run too small for the installment once 20 Nov came.
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P174', $1, '2025-01-06', false, now())`,
      [A, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`,
      [`${A}-t`, T, A],
    );
    // ₱5,000 installment, starting 1 December 2026.
    await q(
      `INSERT INTO "Loan" (id, "tenantId", "employeeId", "loanType", "principalCents", "installmentCents", "balanceCents", "startDate", "updatedAt")
       VALUES ($1, $2, $3, 'COMPANY', 2000000, 500000, 2000000, '2026-12-01', now())`,
      [`${A}-l`, T, A],
    );
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["Loan", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("L1 (T1) a run that ends before the start date deducts nothing", async () => {
    expect(await loanDeduction("2026-10-16", "2026-10-31")).toBe(0n);
    expect(await loanDeduction("2026-11-16", "2026-11-30")).toBe(0n);
  });

  it("L2 a run that reaches the start date deducts the installment", async () => {
    expect(await loanDeduction("2026-12-01", "2026-12-15")).toBe(500000n);
  });

  it("L3 a loan starting on the period's last day is deducted in that run", async () => {
    await q(`UPDATE "Loan" SET "startDate" = '2026-11-30' WHERE id = $1`, [`${A}-l`]);
    expect(await loanDeduction("2026-11-16", "2026-11-30")).toBe(500000n);
    await q(`UPDATE "Loan" SET "startDate" = '2026-12-01' WHERE id = $1`, [`${A}-l`]);
  });
});
