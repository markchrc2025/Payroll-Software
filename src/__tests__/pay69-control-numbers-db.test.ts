/**
 * PAY-69 against real Postgres. Three employees (Cruz, Abad, Bautista); each
 * payslip: gross 33,300.00, SSS 1,000.00, PhilHealth 625.00, Pag-IBIG
 * 200.00, tax 2,864.50, net 28,610.50.
 *
 *   D1  a finalize that is refused (a payslip that does not add up) issues no
 *       number; once fixed, the run is PR-2026-0001 and its payslips are
 *       PS-2026-000001 to 000003 by employee name: Abad, Bautista, Cruz
 *       (fails on main: no numbers).
 *   D2  the next run of 2026 continues both series with no gap; a run whose
 *       period ends in 2027 starts the 2027 series at 0001.
 *   D3  finalizing again changes nothing; an issued number cannot be changed,
 *       even directly in the database.
 *   D4  the payslip PDF's Reference is the payslip's control number.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p69t${sfx}`;
const id = (s: string) => `p69${s}${sfx}`;

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { finalizeRun } from "@/lib/payroll/persist";
import { loadPayslipPdfData } from "@/lib/payslip/pdf-data";
import { withTenant } from "@/lib/with-tenant";

const PEOPLE = [["cruz", "Cruz", "Carla"], ["abad", "Abad", "Ana"], ["baut", "Bautista", "Ben"]] as const;

describeDb("PAY-69 control numbers (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const runNo = async (book: string) => (await q(`SELECT "controlNumber" FROM "PayrollBook" WHERE id = $1`, [book])).rows[0].controlNumber;
  const slips = async (book: string) =>
    (await q(`SELECT e."lastName" n, s."controlNumber" c FROM "PayrollSheet" s JOIN "Employee" e ON e.id = s."employeeId" WHERE s."payrollBookId" = $1 ORDER BY s."controlNumber"`, [book])).rows.map((r) => `${r.n} ${r.c}`);

  const addRun = async (key: string, start: string, end: string, net = 2861050) => {
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', 'DRAFT', now())`,
      [id(key), T, start, end],
    );
    for (const [p] of PEOPLE) {
      await q(
        `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
           "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
           "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
           "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
           "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
         VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true,
           3330000, 3330000, 182500, 3147500, 286450, 100000, 62500, 20000, $5, '[]', '[]', '{}', '{}', now())`,
        [id(`${key}${p}`), T, id(key), id(p), p === "cruz" ? net : 2861050],
      );
    }
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Series Co', $2, now())`, [T, `P69${sfx}`.toUpperCase()]);
    for (const [p, last, first] of PEOPLE) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, $3, $4, $5, '2025-01-06', now())`, [id(p), T, `E-${p}`, first, last]);
    }
    await addRun("nov", "2026-11-01", "2026-11-15", 2862050);
    await addRun("dec", "2026-12-01", "2026-12-15");
    await addRun("jan", "2027-01-01", "2027-01-15");
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["DocumentSeries", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 a refused finalize issues nothing; a finalize numbers the run and its payslips by name", async () => {
    await expect(finalizeRun(T, id("nov"), null)).rejects.toThrow(/does not tie out/);
    expect(await runNo(id("nov"))).toBeNull();
    expect((await q(`SELECT count(*)::int n FROM "DocumentSeries" WHERE "tenantId" = $1`, [T])).rows[0].n).toBe(0);

    await q(`UPDATE "PayrollSheet" SET "netPayCents" = 2861050 WHERE id = $1`, [id("novcruz")]);
    await finalizeRun(T, id("nov"), null);
    expect(await runNo(id("nov"))).toBe("PR-2026-0001");
    expect(await slips(id("nov"))).toEqual(["Abad PS-2026-000001", "Bautista PS-2026-000002", "Cruz PS-2026-000003"]);
  });

  it("D2 the series continue with no gap and start again each year", async () => {
    await finalizeRun(T, id("dec"), null);
    expect(await runNo(id("dec"))).toBe("PR-2026-0002");
    expect(await slips(id("dec"))).toEqual(["Abad PS-2026-000004", "Bautista PS-2026-000005", "Cruz PS-2026-000006"]);
    await finalizeRun(T, id("jan"), null);
    expect(await runNo(id("jan"))).toBe("PR-2027-0001");
    expect((await slips(id("jan")))[0]).toBe("Abad PS-2027-000001");
  });

  it("D3 numbers never change", async () => {
    await finalizeRun(T, id("nov"), null);
    expect(await runNo(id("nov"))).toBe("PR-2026-0001");
    await expect(q(`UPDATE "PayrollBook" SET "controlNumber" = 'PR-2026-0099' WHERE id = $1`, [id("nov")])).rejects.toThrow(/cannot be changed/);
    await expect(q(`UPDATE "PayrollSheet" SET "controlNumber" = NULL WHERE id = $1`, [id("novabad")])).rejects.toThrow(/cannot be changed/);
  });

  it("D4 the payslip Reference is its control number", async () => {
    const data = await withTenant(T, (tx) => loadPayslipPdfData(tx, { tenantId: T, bookId: id("dec"), employeeId: id("baut") }));
    expect(data.meta.reference).toBe("PS-2026-000005");
  });
});
