/**
 * PAY-203 (Mark, 20 Nov 2026, ruling 3): a failed cross-foot check 1 (a
 * payslip does not add up) or 2 (the register does not equal its payslips)
 * blocks finalize; reports stay downloadable and show the red line; a run
 * with no payslips says "no payslips" instead of "ties out".
 *
 * A draft run, 1 to 15 Nov 2026, one payslip: gross 33,300.00, SSS 1,000.00,
 * PhilHealth 625.00, Pag-IBIG 200.00, tax 2,864.50: net 28,610.50.
 *
 *   D1  net pay changed to 28,620.50 behind the application's back: finalize
 *       is refused with the reason, and the run stays a draft (fails on main:
 *       main finalizes it).
 *   D2  net pay put back: finalize goes through.
 *   D3  a run with no payslips: the cross-foot endpoint says empty, not "ties
 *       out", and lists no checks.
 *   T4  the panel shows "No payslips" for an empty run.
 */
import { randomBytes } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p203t${sfx}`;
const id = (s: string) => `p203${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })), checkPermission: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { finalizeRun, PayrollRunDoesNotTieOutError } from "@/lib/payroll/persist";
import { GET as crossFoot } from "@/app/api/payroll/runs/[id]/cross-foot/route";
import { CrossFootPanel } from "@/components/reports/CrossFootPanel";

describeDb("PAY-203 a run that does not tie out cannot be finalized (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const status = async (book: string) => (await q(`SELECT status FROM "PayrollBook" WHERE id = $1`, [book])).rows[0].status;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tie Co', $2, now())`, [T, `P203${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2025-01-06', now())`,
      [id("ana"), T],
    );
    for (const [key, start, end] of [["book", "2026-11-01", "2026-11-15"], ["empty", "2026-10-01", "2026-10-15"]]) {
      await q(
        `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
         VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', 'DRAFT', now())`,
        [id(key!), T, start, end],
      );
    }
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true,
         3330000, 3330000, 182500, 3147500, 286450, 100000, 62500, 20000, 2862050, '[]', '[]', '{}', '{}', now())`,
      [id("sheet"), T, id("book"), id("ana")],
    );
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 a payslip that does not add up blocks finalize", async () => {
    const err = await finalizeRun(T, id("book"), null).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PayrollRunDoesNotTieOutError);
    expect((err as Error).message).toContain("This run does not tie out, so it cannot be finalized");
    expect((err as Error).message).toContain("Each payslip: gross less deductions equals net pay");
    expect((err as PayrollRunDoesNotTieOutError).checks.map((c) => c.id)).toEqual(["Q4-1", "Q4-2x"]);
    expect(await status(id("book"))).toBe("DRAFT");
  });

  it("D2 once it adds up, finalize goes through", async () => {
    await q(`UPDATE "PayrollSheet" SET "netPayCents" = 2861050 WHERE id = $1`, [id("sheet")]);
    await finalizeRun(T, id("book"), null);
    expect(await status(id("book"))).toBe("FINALIZED");
  });

  it("D3 a run with no payslips is empty, not tied out", async () => {
    const res = await crossFoot(new NextRequest(`http://localhost/api/payroll/runs/${id("empty")}/cross-foot`), { params: Promise.resolve({ id: id("empty") }) });
    const data = (await res.json()).data;
    expect(data).toMatchObject({ empty: true, tiesOut: false, checks: [] });
  });
});

describe("PAY-203 the panel", () => {
  it("T4 an empty run says no payslips", () => {
    const html = renderToStaticMarkup(createElement(CrossFootPanel, { checks: [], empty: true }));
    expect(html).toContain('data-ties-out="empty"');
    expect(html).toContain("No payslips: nothing to cross-foot.");
    expect(html).not.toContain("Ties out");
  });
});
