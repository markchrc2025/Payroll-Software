/**
 * Wave G1 (PAY-217) against real Postgres: Salary Adjustment.
 * Regional minimum (tenant rule from 1 Jul 2026): NCR 695.00 a day.
 *   Ana   30,000.00 a month; Jul 1-15 finalized at that rate (basic 15,000.00)
 *   Mila  600.00 a day, MWE, NCR; Jul 16-31 draft (12 days at 695.00 = 8,340.00)
 *   Ben   800.00 a day, NCR
 *
 *   D1  wage order: Mila (below 695.00) is proposed, Ben is not; the
 *       minimum-wage rule brings her to 695.00 and skips Ben (fails on main).
 *   D2  Ana +5% from 8 Jul: 31,500.00; the author cannot approve; a second
 *       person approves: one SALARY_ADJUSTMENT movement, a new term from
 *       8 Jul, and back pay for the days already paid: 750.00 x 8/15 = 400.00.
 *   D3  Mila from 20 Jul, mid-cutoff of the Jul 16-31 draft paid at the new
 *       rate: the 4 days before are taken back at the old rate,
 *       (8,340.00 - 7,200.00) x 4/16 = 285.00.
 *   D4  a salary changed since the preview refuses the approval.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { approveBatch, createBatch, preview, splitRun, wageOrderProposal, type SalaryAdjustmentError } from "@/lib/salary-adjustment/batch";
import { withTenant } from "@/lib/with-tenant";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wg1t${sfx}`;
const id = (s: string) => `wg1${s}${sfx}`;
const HANA = id("hana");
const RICO = id("rico");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("Wave G1 salary adjustment (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as SalaryAdjustmentError);
  const book = (key: string, start: string, end: string, status: string) =>
    q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5, now())`, [id(key), T, start, end, status]);
  const sheet = (key: string, emp: string, type: string, rate: number, base: number) => q(
    `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
       "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
       "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
       "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
       "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
     VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', $5::"SalaryType", $6, 261, true, $7, $7, 0, $7, 0, 0, 0, 0, $7, '[]', '[]', '{}', '{}', now())`,
    [id(`${key}${emp}`), T, id(key), id(emp), type, rate, base],
  );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Raise Co', $2, now())`, [T, `WG1${sfx}`.toUpperCase()]);
    for (const u of [HANA, RICO]) await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'U', 'U', now())`, [u, T, `${u}@t.test`]);
    const emps: [string, string, string, number][] = [["ana", "MONTHLY", "REGULAR", 3000000], ["mila", "DAILY", "MWE", 60000], ["ben", "DAILY", "REGULAR", 80000]];
    for (const [e, type, tax, rate] of emps) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", region, "salaryType", "taxClassification", "updatedAt")
               VALUES ($1, $2, $3, 'X', $4, '2025-01-06', 'NCR', $5::"SalaryType", $6::"TaxClassification", now())`, [id(e), T, `E-${e}`, e, type, tax]);
      await q(`INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt") VALUES ($1, $2, $3, '2025-01-06', $4, $5::"SalaryType", now())`, [id(`t${e}`), T, id(e), rate, type]);
    }
    await q(`INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
             VALUES ($1, $2, 'MINIMUM_WAGE_RATE', '2026-07-01', 'Test wage order', 'WO-T', $3, now())`,
      [id("mw"), T, JSON.stringify({ regions: { NCR: { label: "NCR", dailyRate: 69500, basis: "Test wage order" } } })]);
    await book("j1", "2026-07-01", "2026-07-15", "FINALIZED"); await sheet("j1", "ana", "MONTHLY", 3000000, 1500000);
    await book("j2", "2026-07-16", "2026-07-31", "DRAFT"); await sheet("j2", "mila", "DAILY", 69500, 834000);
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`ALTER TABLE "PayrollSheet" DISABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" DISABLE TRIGGER USER`);
    for (const t of ["PayrollAdjustment", "PayrollCorrection", "PayrollSheet", "PayrollBook"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "PayrollSheet" ENABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" ENABLE TRIGGER USER`);
    for (const t of ["SalaryAdjustmentLine", "SalaryAdjustmentBatch", "EmployeeMovement", "EmploymentTerm", "StatutoryRule", "DocumentSeries", "Employee", "User"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the wage order proposes an MWE below the new rate", async () => {
    const p = await withTenant(T, (tx) => wageOrderProposal(tx, T, d("2026-07-01")));
    expect(p.employees.map((e) => [e.employeeId, e.dailyCents, e.minimumDailyCents])).toEqual([[id("mila"), "60000", "69500"]]);
    const pv = await withTenant(T, (tx) => preview(tx, T, { rule: "MIN_WAGE" }, [id("mila"), id("ben")], d("2026-07-20")));
    expect(pv.lines.map((l) => [l.employeeId, l.fromCents, l.toCents])).toEqual([[id("mila"), "60000", "69500"]]);
    expect(pv.skipped).toEqual([{ employeeId: id("ben"), name: "ben, X", reason: "Already at or above the minimum" }]);
  });

  it("D2 approval: a movement, a new term, and back pay for the days already paid", async () => {
    const b = await withTenant(T, (tx) => createBatch(tx, T, HANA, { rule: "PERCENT", percentBasisPoints: 500, name: "Merit 2026", reason: "Annual review", effectiveDate: d("2026-07-08"), employeeIds: [id("ana")] }));
    expect(b.lines.map((l) => [l.fromCents, l.toCents])).toEqual([[3000000n, 3150000n]]);
    expect((await fail(withTenant(T, (tx) => approveBatch(tx, T, HANA, b.id))))?.status).toBe(403);
    const r = await withTenant(T, (tx) => approveBatch(tx, T, RICO, b.id));
    expect(r.movements).toBe(1);
    expect(r.backPay).toMatchObject({ payslips: 1, totalCents: "40000" });
    const mv = (await q(`SELECT "movementType", "approvalStatus", "toBasicSalaryCents" FROM "EmployeeMovement" WHERE "employeeId" = $1`, [id("ana")])).rows;
    expect(mv).toEqual([{ movementType: "SALARY_ADJUSTMENT", approvalStatus: "APPROVED", toBasicSalaryCents: "3150000" }]);
    const term = (await q(`SELECT "basicSalaryCents", "effectiveDate"::date::text AS eff FROM "EmploymentTerm" WHERE "employeeId" = $1 ORDER BY "effectiveDate" DESC LIMIT 1`, [id("ana")])).rows[0];
    expect(term).toEqual({ basicSalaryCents: "3150000", eff: "2026-07-08" });
    const corr = (await q(`SELECT kind, status, "netEffectCents" FROM "PayrollCorrection" WHERE "batchId" = $1`, [r.backPay!.batchId])).rows;
    expect(corr).toEqual([{ kind: "RETRO_PAY", status: "DRAFT", netEffectCents: "40000" }]);
  });

  it("D3 an effective date mid-cutoff splits the draft run's pay", async () => {
    const b = await withTenant(T, (tx) => createBatch(tx, T, HANA, { rule: "MIN_WAGE", name: "Wage order", reason: "New NCR minimum", effectiveDate: d("2026-07-20"), employeeIds: [id("mila")] }));
    await withTenant(T, (tx) => approveBatch(tx, T, RICO, b.id));
    const s = await withTenant(T, (tx) => splitRun(tx, T, b.id, id("j2")));
    expect(s.adjustments).toEqual([{ employeeId: id("mila"), amountCents: "-28500" }]);
    const adj = (await q(`SELECT kind, "amountCents", "isTaxable" FROM "PayrollAdjustment" WHERE "payrollBookId" = $1`, [id("j2")])).rows;
    expect(adj).toEqual([{ kind: "DEDUCTION", amountCents: "28500", isTaxable: true }]);
    expect((await withTenant(T, (tx) => splitRun(tx, T, b.id, id("j2")))).adjustments).toEqual([]);
    expect((await fail(withTenant(T, (tx) => splitRun(tx, T, b.id, id("j1")))))?.status).toBe(409);
  });

  it("D4 a salary changed since the preview is refused", async () => {
    const b = await withTenant(T, (tx) => createBatch(tx, T, HANA, { rule: "FIXED", fixedCents: 5000n, name: "COLA", reason: "Cost of living", effectiveDate: d("2026-08-01"), employeeIds: [id("ben")] }));
    await q(`UPDATE "EmploymentTerm" SET "basicSalaryCents" = 82000 WHERE id = $1`, [id("tben")]);
    expect((await fail(withTenant(T, (tx) => approveBatch(tx, T, RICO, b.id))))?.status).toBe(409);
  });
});
