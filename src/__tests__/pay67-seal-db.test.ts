/**
 * PAY-67 (1.12; Q1, Q5b, Q8b): a finalized payroll run is sealed at the
 * database, and its payslips reprint from the seal-time snapshot.
 *
 * Writes below are tried as payroll_app, the role the application runs as in
 * production (a database superuser is not bound: it can switch triggers off).
 * One payslip, Nov 1-15 2026: net 28,610.50 (as PAY-203).
 *
 *   D1  finalizing keeps a snapshot of each payslip; after the employee's name
 *       and the company address change, the reprint still shows the old ones
 *       (fails on main: reprints read today's records).
 *   D2  the sealed run: changing a value, setting one to NULL, or deleting
 *       the run is refused; updatedAt alone may change.
 *   D3  its payslips: changing a figure, clearing the snapshot, deleting one
 *       or adding one is refused; storing the PDF's key is allowed.
 *   D4  its adjustments cannot be added; a draft run is not sealed.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p67t${sfx}`;
const id = (s: string) => `p67${s}${sfx}`;

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { finalizeRun } from "@/lib/payroll/persist";
import { loadPayslipPdfData } from "@/lib/payslip/pdf-data";
import { withTenant } from "@/lib/with-tenant";

describeDb("PAY-67 sealed runs (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  /** One statement as payroll_app inside the tenant, rolled back afterwards. */
  const asApp = async (sql: string, args: unknown[] = []) => {
    await q("BEGIN");
    try {
      await q("SET LOCAL ROLE payroll_app");
      await q("SELECT set_config('app.current_tenant_id', $1, true)", [T]);
      const r = await q(sql, args);
      return r.rowCount;
    } finally {
      await q("ROLLBACK");
    }
  };
  const sheetInsert = (sheetId: string, book: string) => q(
    `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
       "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
       "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
       "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
       "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
     VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true,
       3330000, 3330000, 182500, 3147500, 286450, 100000, 62500, 20000, 2861050, '[]', '[]', '{}', '{}', now())`,
    [sheetId, T, book, id("ana")],
  );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", address, "updatedAt") VALUES ($1, 'Seal Co', $2, '12 Shoe Avenue', now())`, [T, `P67${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2025-01-06', now())`, [id("ana"), T]);
    for (const [key, start, end] of [["book", "2026-11-01", "2026-11-15"], ["draft", "2026-11-16", "2026-11-30"]]) {
      await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', 'DRAFT', now())`, [id(key!), T, start, end]);
    }
    await sheetInsert(id("sheet"), id("book"));
    await sheetInsert(id("dsheet"), id("draft"));
    await finalizeRun(T, id("book"), null);
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "PayrollAdjustment" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["DocumentSeries", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the reprint comes from the seal-time snapshot", async () => {
    const snap = (await q(`SELECT "sealSnapshot" s FROM "PayrollSheet" WHERE id = $1`, [id("sheet")])).rows[0].s;
    expect(snap.employee.name).toBe("Ana Santos");
    expect(snap.net).toBeDefined();
    await q(`UPDATE "Employee" SET "lastName" = 'Reyes' WHERE id = $1`, [id("ana")]);
    await q(`UPDATE "Tenant" SET address = '99 New Road' WHERE id = $1`, [T]);
    const data = await withTenant(T, (tx) => loadPayslipPdfData(tx, { tenantId: T, bookId: id("book"), employeeId: id("ana") }));
    expect(data.employee.name).toBe("Ana Santos");
    expect(data.company.address).toBe("12 Shoe Avenue");
    expect(data.meta.reference).toMatch(/^PS-2026-\d{6}$/);
    expect(typeof data.gross).toBe("bigint");
    expect(data.gross).toBe(3330000n);
    expect(data.meta.periodEnd).toBeInstanceOf(Date);
  });

  it("D2 the sealed run", async () => {
    await expect(asApp(`UPDATE "PayrollBook" SET notes = 'changed' WHERE id = $1`, [id("book")])).rejects.toThrow(/is sealed: notes cannot be changed/);
    await expect(asApp(`UPDATE "PayrollBook" SET "finalizedAt" = NULL WHERE id = $1`, [id("book")])).rejects.toThrow(/is sealed: finalizedAt cannot be changed/);
    await expect(asApp(`UPDATE "PayrollBook" SET status = 'DRAFT' WHERE id = $1`, [id("book")])).rejects.toThrow(/is sealed: status cannot be changed/);
    await expect(asApp(`DELETE FROM "PayrollBook" WHERE id = $1`, [id("book")])).rejects.toThrow(/cannot be deleted/);
    expect(await asApp(`UPDATE "PayrollBook" SET "updatedAt" = now() WHERE id = $1`, [id("book")])).toBe(1);
  });

  it("D3 its payslips", async () => {
    await expect(asApp(`UPDATE "PayrollSheet" SET "netPayCents" = 1 WHERE id = $1`, [id("sheet")])).rejects.toThrow(/is sealed: netPayCents cannot be changed/);
    await expect(asApp(`UPDATE "PayrollSheet" SET "sealSnapshot" = NULL WHERE id = $1`, [id("sheet")])).rejects.toThrow(/sealSnapshot cannot be changed/);
    await expect(asApp(`DELETE FROM "PayrollSheet" WHERE id = $1`, [id("sheet")])).rejects.toThrow(/belongs to a finalized run/);
    await expect(asApp(`UPDATE "PayrollSheet" SET "payrollBookId" = $2 WHERE id = $1`, [id("dsheet"), id("book")])).rejects.toThrow(/no payslip can be added/);
    expect(await asApp(`UPDATE "PayrollSheet" SET "payslipKey" = 'tenants/x/payslips/a.pdf' WHERE id = $1`, [id("sheet")])).toBe(1);
  });

  it("D4 adjustments, and a draft is not sealed", async () => {
    await expect(asApp(
      `INSERT INTO "PayrollAdjustment" (id, "tenantId", "employeeId", "payrollBookId", kind, "amountCents", reason, "updatedAt") VALUES ($1, $2, $3, $4, 'ADDITION', 100, 'late', now())`,
      [id("adj"), T, id("ana"), id("book")],
    )).rejects.toThrow(/adjustments cannot be added/);
    expect(await asApp(`UPDATE "PayrollSheet" SET "netPayCents" = 1 WHERE id = $1`, [id("dsheet")])).toBe(1);
    expect(await asApp(`UPDATE "PayrollBook" SET notes = 'fine' WHERE id = $1`, [id("draft")])).toBe(1);
  });
});
