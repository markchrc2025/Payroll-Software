/**
 * PAY-166 against real Postgres. Ana, 30,000.00 a month until a retroactive
 * increase to 33,000.00 for January and February 2026:
 *   Jan 1-15 (finalized): basic 15,000.00, overtime 1,200.00, lates 500.00
 *     -> basic +1,500.00, overtime +120.00, lates -50.00 = 1,570.00
 *   Jan 16-31 (finalized): basic 15,000.00 -> +1,500.00
 *   Feb 1-15 (finalized, already at 33,000.00): skipped
 *   an off-cycle run in January: not a regular payslip, skipped
 *
 *   D1  the preview: two payslips, 3,070.00 in all (fails on main).
 *   D2  saved as two draft corrections of one batch; the author cannot
 *       approve it; a second person approves it into the Mar 1-15 draft:
 *       PC numbers, taxable adjustments.
 *   D3  a draft run without the employee is refused.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { approveRetroPay, createRetroPay, previewRetroPay, retroPaySchema } from "@/lib/payroll/retro-pay";
import type { CorrectionError } from "@/lib/payroll/corrections";
import { withTenant } from "@/lib/with-tenant";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p166t${sfx}`;
const id = (s: string) => `p166${s}${sfx}`;
const HANA = id("hana");
const RICO = id("rico");

describeDb("PAY-166 retroactive increase (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as CorrectionError);
  const book = async (key: string, start: string, end: string, status: string, runType = "REGULAR") =>
    q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', $5, $6, now())`, [id(key), T, start, end, runType, status]);
  const sheet = async (key: string, emp: string, rate: number, base: number, ot = 0, lates = 0) => q(
    `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
       "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
       "basePayCents", "otPayCents", "lateUndertimeDeductionCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
       "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
       "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
     VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', $5, 261, true, $6, $7, $8, $6, 0, $6, 0, 0, 0, 0, $6, '[]', '[]', '{}', '{}', now())`,
    [id(`${key}${emp}`), T, id(key), id(emp), rate, base, ot, lates],
  );
  const input = () => retroPaySchema.parse({ employees: [{ employeeId: id("ana"), newBasicSalaryCents: "3300000" }], from: "2026-01-01", to: "2026-02-28", reason: "Merit increase approved 10 Mar" });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Retro Co', $2, now())`, [T, `P166${sfx}`.toUpperCase()]);
    for (const u of [HANA, RICO]) await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'U', 'U', now())`, [u, T, `${u}@t.test`]);
    for (const e of ["ana", "ben"]) await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, $3, 'X', $4, '2025-01-06', now())`, [id(e), T, `E-${e}`, e]);
    await book("j1", "2026-01-01", "2026-01-15", "FINALIZED"); await sheet("j1", "ana", 3000000, 1500000, 120000, 50000);
    await book("j2", "2026-01-16", "2026-01-31", "FINALIZED"); await sheet("j2", "ana", 3000000, 1500000);
    await book("f1", "2026-02-01", "2026-02-15", "FINALIZED"); await sheet("f1", "ana", 3300000, 1650000);
    await book("oc", "2026-01-20", "2026-01-20", "FINALIZED", "OFF_CYCLE"); await sheet("oc", "ana", 3000000, 100000);
    await book("m1", "2026-03-01", "2026-03-15", "DRAFT"); await sheet("m1", "ana", 3300000, 1650000);
    await book("benonly", "2026-03-16", "2026-03-31", "DRAFT"); await sheet("benonly", "ben", 3000000, 1500000);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["PayrollAdjustment", "PayrollCorrection", "PayrollSheet", "PayrollBook", "DocumentSeries", "Employee", "User"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the preview", async () => {
    const p = await withTenant(T, (tx) => previewRetroPay(tx, T, input()));
    expect(p.map((x) => [x.periodStart, x.totalCents])).toEqual([["2026-01-01", "157000"], ["2026-01-16", "150000"]]);
    expect(p[0]!.lines.map((l) => [l.item, l.amountCents])).toEqual([["BASIC", "150000"], ["OVERTIME", "12000"], ["LATES", "-5000"]]);
  });

  let batchId = "";
  it("D2 a batch, approved by someone else, lands forward", async () => {
    const r = await withTenant(T, (tx) => createRetroPay(tx, T, HANA, input()));
    batchId = r.batchId;
    expect(r).toMatchObject({ payslips: 2, totalCents: "307000" });
    const rows = (await q(`SELECT kind, status FROM "PayrollCorrection" WHERE "batchId" = $1`, [batchId])).rows;
    expect(rows).toEqual([{ kind: "RETRO_PAY", status: "DRAFT" }, { kind: "RETRO_PAY", status: "DRAFT" }]);
    expect((await fail(withTenant(T, (tx) => approveRetroPay(tx, T, HANA, batchId, id("m1")))))?.status).toBe(403);
    const ok = await withTenant(T, (tx) => approveRetroPay(tx, T, RICO, batchId, id("m1")));
    expect(ok.map((c) => c.controlNumber).sort()).toEqual([`PC-${new Date().getUTCFullYear()}-0001`, `PC-${new Date().getUTCFullYear()}-0002`]);
    const adj = (await q(`SELECT kind, "amountCents"::text a, "isTaxable" t FROM "PayrollAdjustment" WHERE "payrollBookId" = $1 ORDER BY kind, "amountCents"`, [id("m1")])).rows;
    expect(adj).toEqual([
      { kind: "ADDITION", a: "12000", t: true }, { kind: "ADDITION", a: "150000", t: true }, { kind: "ADDITION", a: "150000", t: true },
      { kind: "DEDUCTION", a: "5000", t: true },
    ]);
  });

  it("D3 a run without the employee is refused", async () => {
    const r = await withTenant(T, (tx) => createRetroPay(tx, T, HANA, { ...input(), from: "2026-01-01", to: "2026-01-15", reason: "Second batch for the test" }));
    const e = await fail(withTenant(T, (tx) => approveRetroPay(tx, T, RICO, r.batchId, id("benonly"))));
    expect(e?.message).toContain("no payslip in that draft run");
  });
});
