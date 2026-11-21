/**
 * PAY-197 part 1 against real Postgres. Checklist: "Laptop returned" (IT,
 * Ivan) and "No cash advances" (Finance, Fe). Ana leaves on 14 Nov 2026; her
 * final pay run (1 to 14 Nov) has one payslip, net 28,610.50.
 *
 *   D1  a case copies the active checklist; with no checklist a case is
 *       cleared at once (fails on main: no module).
 *   D2  only an item's signatory signs it off, never the leaving employee;
 *       HR can reassign a pending item; when the last is signed off the case
 *       is CLEARED.
 *   D3  ruling 3: the final pay run cannot be finalized while clearance is
 *       open; it can once cleared.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p197t${sfx}`;
const T2 = `p197u${sfx}`;
const id = (s: string) => `p197${s}${sfx}`;

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { clearItem, openCase, OffboardingError, reassignItem } from "@/lib/offboarding/clearance";
import { finalizeRun } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";

describeDb("PAY-197 offboarding clearance (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as OffboardingError);
  let caseId = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    for (const t of [T, T2]) await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Exit Co', $2, now())`, [t, t.toUpperCase()]);
    for (const u of ["ivan", "fe", "hr", "anau"]) await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', $4, 'U', now())`, [id(u), T, `${id(u)}@t.test`, u]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "userId", "updatedAt") VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2025-01-06', $3, now())`, [id("ana"), T, id("anau")]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-BO', 'Bo', 'Lim', '2025-01-06', now())`, [id("bo"), T2]);
    await q(`INSERT INTO "ClearanceTemplateItem" (id, "tenantId", name, "signatoryUserId", "sortOrder", "updatedAt") VALUES ($1, $2, 'Laptop returned', $3, 1, now()), ($4, $2, 'No cash advances', $5, 2, now()), ($6, $2, 'Old item', $5, 3, now())`, [id("t1"), T, id("ivan"), id("t2"), id("fe"), id("t3")]);
    await q(`UPDATE "ClearanceTemplateItem" SET "isActive" = false WHERE id = $1`, [id("t3")]);
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "separationReason", "updatedAt") VALUES ($1, $2, '2026-11-01', '2026-11-14', 'SEMI_MONTHLY', 'FINAL_PAY', 'DRAFT', 'RESIGNATION', now())`, [id("fp"), T]);
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true,
         3330000, 3330000, 182500, 3147500, 286450, 100000, 62500, 20000, 2861050, '[]', '[]', '{}', '{}', now())`,
      [id("fps"), T, id("fp"), id("ana")],
    );
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["ClearanceItem", "OffboardingCase", "ClearanceTemplateItem", "PayrollSheet", "PayrollBook", "DocumentSeries", "AuditLog", "Employee", "User"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1)`, [[T, T2]]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[T, T2]]);
    await admin.end();
  });

  it("D1 a case copies the active checklist", async () => {
    const c = await withTenant(T, (tx) => openCase(tx, T, { employeeId: id("ana"), separationReason: "RESIGNATION", lastWorkingDay: new Date("2026-11-14T00:00:00Z"), createdByUserId: id("hr") }));
    caseId = c.id;
    const items = (await q(`SELECT name, status FROM "ClearanceItem" WHERE "caseId" = $1 ORDER BY "sortOrder"`, [caseId])).rows;
    expect(items).toEqual([{ name: "Laptop returned", status: "PENDING" }, { name: "No cash advances", status: "PENDING" }]);
    expect(c.status).toBe("OPEN");
    const again = await withTenant(T, (tx) => openCase(tx, T, { employeeId: id("ana"), separationReason: "RESIGNATION", lastWorkingDay: new Date("2026-11-14T00:00:00Z"), createdByUserId: id("hr") }));
    expect(again.id).toBe(caseId);
    const empty = await withTenant(T2, (tx) => openCase(tx, T2, { employeeId: id("bo"), separationReason: "RESIGNATION", lastWorkingDay: new Date("2026-11-14T00:00:00Z"), createdByUserId: null }));
    expect(empty.status).toBe("CLEARED");
  });

  it("D2 only the signatory, never the leaving employee", async () => {
    const item = async (name: string) => (await q(`SELECT id FROM "ClearanceItem" WHERE "caseId" = $1 AND name = $2`, [caseId, name])).rows[0].id as string;
    const laptop = await item("Laptop returned");
    const cash = await item("No cash advances");
    expect((await fail(withTenant(T, (tx) => clearItem(tx, T, id("fe"), laptop))))?.status).toBe(403);
    await withTenant(T, (tx) => clearItem(tx, T, id("ivan"), laptop, "Returned in good order"));
    await withTenant(T, (tx) => reassignItem(tx, T, cash, id("anau")));
    expect((await fail(withTenant(T, (tx) => clearItem(tx, T, id("anau"), cash))))?.message).toContain("cannot sign off their own clearance");
    await withTenant(T, (tx) => reassignItem(tx, T, cash, id("fe")));
    expect((await q(`SELECT status FROM "OffboardingCase" WHERE id = $1`, [caseId])).rows[0].status).toBe("OPEN");
  });

  it("D3 final pay waits for clearance", async () => {
    await expect(finalizeRun(T, id("fp"), null)).rejects.toThrow(/Clearance is not complete.*Ana Santos \(E-ANA\): No cash advances/);
    expect((await q(`SELECT status FROM "PayrollBook" WHERE id = $1`, [id("fp")])).rows[0].status).toBe("DRAFT");
    const cash = (await q(`SELECT id FROM "ClearanceItem" WHERE "caseId" = $1 AND name = 'No cash advances'`, [caseId])).rows[0].id;
    await withTenant(T, (tx) => clearItem(tx, T, id("fe"), cash));
    expect((await q(`SELECT status FROM "OffboardingCase" WHERE id = $1`, [caseId])).rows[0].status).toBe("CLEARED");
    await finalizeRun(T, id("fp"), null);
    expect((await q(`SELECT status FROM "PayrollBook" WHERE id = $1`, [id("fp")])).rows[0].status).toBe("FINALIZED");
  });
});
