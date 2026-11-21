/**
 * PAY-68 against real Postgres. A finalized payslip, Nov 1-15 2026: basic
 * 33,300.00, net 28,610.50. Draft runs: Nov 16-30 (forward) and Oct 16-31
 * (earlier). Hana writes corrections, Rico approves.
 *
 *   D1  a correction of a finalized payslip is saved as a draft; a draft
 *       payslip is not corrected this way (fails on main: no corrections).
 *   D2  its author cannot approve it; Rico can: it gets PC-2026-0001 and
 *       lands forward as adjustments in the Nov 16-30 draft. An earlier run
 *       or a finalized run is refused.
 *   D3  the guard holds across corrections: a second one that would take back
 *       more basic than was paid is refused.
 *   D4  an approved correction's figures cannot be changed (payroll_app);
 *       it can be corrected by another correction; cancelling one in a draft
 *       removes its adjustments; one paid in a finalized run cannot be
 *       cancelled.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { approveCorrection, cancelCorrection, CorrectionError, createCorrection } from "@/lib/payroll/corrections";
import { withTenant } from "@/lib/with-tenant";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p68t${sfx}`;
const id = (s: string) => `p68${s}${sfx}`;
const HANA = id("hana");
const RICO = id("rico");

describeDb("PAY-68 corrections (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const run = <R>(fn: Parameters<typeof withTenant<R>>[1]) => withTenant<R>(T, fn);
  const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as CorrectionError);
  const book = async (key: string, start: string, end: string, status: string) => {
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5, now())`, [id(key), T, start, end, status]);
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
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Fix Co', $2, now())`, [T, `P68${sfx}`.toUpperCase()]);
    for (const u of [HANA, RICO]) await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'U', 'U', now())`, [u, T, `${u}@t.test`]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2025-01-06', now())`, [id("ana"), T]);
    await book("nov", "2026-11-01", "2026-11-15", "FINALIZED");
    await book("late", "2026-11-16", "2026-11-30", "DRAFT");
    await book("early", "2026-10-16", "2026-10-31", "DRAFT");
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "PayrollAdjustment" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollCorrection" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["DocumentSeries", "Employee", "User"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  let first = "";
  it("D1 a draft correction of a finalized payslip", async () => {
    const c = await run((tx) => createCorrection(tx, T, HANA, {
      originalSheetId: id("novs"), reason: "Overtime on 12 Nov was not paid",
      lines: [{ item: "BASIC", amountCents: "-500000", taxable: true }, { item: "OTHER", amountCents: "150000", taxable: false, description: "Meal allowance owed" }],
    }));
    first = c.id;
    expect(c).toMatchObject({ status: "DRAFT", controlNumber: null, netEffectCents: -350000n });
    const e = await fail(run((tx) => createCorrection(tx, T, HANA, { originalSheetId: id("lates"), reason: "a draft payslip", lines: [{ item: "BASIC", amountCents: "1", taxable: true }] })));
    expect(e?.status).toBe(409);
  });

  it("D2 a second person approves; it lands forward", async () => {
    expect((await fail(run((tx) => approveCorrection(tx, T, HANA, first, id("late")))))?.status).toBe(403);
    expect((await fail(run((tx) => approveCorrection(tx, T, RICO, first, id("early")))))?.message).toContain("lands forward");
    expect((await fail(run((tx) => approveCorrection(tx, T, RICO, first, id("nov")))))?.message).toContain("draft run");
    const c = await run((tx) => approveCorrection(tx, T, RICO, first, id("late")));
    expect(c).toMatchObject({ status: "APPROVED", controlNumber: "PC-2026-0001", approvedByUserId: RICO, targetBookId: id("late") });
    const adj = (await q(`SELECT kind, "amountCents"::text a, "isTaxable" t, reason FROM "PayrollAdjustment" WHERE "correctionId" = $1 ORDER BY kind`, [first])).rows;
    expect(adj).toEqual([
      { kind: "ADDITION", a: "150000", t: false, reason: "Correction PC-2026-0001: Other, Meal allowance owed" },
      { kind: "DEDUCTION", a: "500000", t: true, reason: "Correction PC-2026-0001: Basic pay" },
    ]);
  });

  it("D3 the guard holds across corrections", async () => {
    const e = await fail(run((tx) => createCorrection(tx, T, HANA, { originalSheetId: id("novs"), reason: "Take back the rest", lines: [{ item: "BASIC", amountCents: "-2830001", taxable: true }] })));
    expect(e?.status).toBe(422);
    expect(e?.problems[0]).toBe("Basic pay: corrections take back 33,300.01, but the payslip paid 33,300.00.");
  });

  it("D4 fixed once approved; corrected by another; cancelling", async () => {
    await q("BEGIN");
    await q("SET LOCAL ROLE payroll_app");
    await q("SELECT set_config('app.current_tenant_id', $1, true)", [T]);
    await expect(q(`UPDATE "PayrollCorrection" SET "netEffectCents" = 0 WHERE id = $1`, [first])).rejects.toThrow(/is approved: netEffectCents cannot be changed/);
    await q("ROLLBACK");

    const second = await run((tx) => createCorrection(tx, T, HANA, { originalSheetId: id("novs"), correctsId: first, reason: "PC-2026-0001 took back too much basic", lines: [{ item: "BASIC", amountCents: "200000", taxable: true }] }));
    expect(second.correctsId).toBe(first);
    const approved = await run((tx) => approveCorrection(tx, T, RICO, second.id, id("late")));
    expect(approved.controlNumber).toBe("PC-2026-0002");

    const cancelled = await run((tx) => cancelCorrection(tx, T, second.id));
    expect(cancelled).toMatchObject({ status: "CANCELLED", targetBookId: null });
    expect((await q(`SELECT count(*)::int n FROM "PayrollAdjustment" WHERE "correctionId" = $1`, [second.id])).rows[0].n).toBe(0);

    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [id("late")]);
    expect((await fail(run((tx) => cancelCorrection(tx, T, first))))?.message).toContain("correct it with a new correction");
  });
});
