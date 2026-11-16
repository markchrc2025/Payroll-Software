/**
 * PAY-160 on a real Postgres, through the real API under row-level security.
 *
 * Company T: Ana (₱30,000, SSS with MPF) and Jose (₱25,000). Finalized runs
 * 16 to 31 Oct (Ana) and 1 to 15 and 16 to 30 Nov (both; the first cutoff
 * deducts, the second records zero). A DRAFT run 9 to 15 Nov with
 * contributions must not count. Company U has a finalized November sheet of
 * its own.
 *
 *   D1  (T1) November for everyone: one row each for Ana and Jose with their
 *       shares and bases; the draft run and company U are left out; the
 *       totals equal the real SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF
 *       routes for November.
 *   D2  Ana's history for 2026: October and November, month by month.
 *   D3  CSV: a download with a filename, the header, one line per row and a
 *       TOTAL line.
 *   D4  a query without a month or an employee, or with month 13, is refused.
 *   D5  another company's employee id gives nothing.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p160t${sfx}`;
const U = `p160u${sfx}`;
const id = (s: string) => `p160${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p160-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));

import { GET } from "@/app/api/payroll/statutory-contributions/route";
import { GET as getR3 } from "@/app/api/payroll/reports/sss/r3/route";
import { GET as getRf1 } from "@/app/api/payroll/reports/philhealth/rf1/route";
import { GET as getMcrf } from "@/app/api/payroll/reports/pagibig/mcrf/route";
import {
  CONTRIBUTION_CSV_HEADER,
  type ContributionRow,
  type ContributionTotals,
} from "@/lib/payroll/reports/statutory-contributions";

type Body = { data: { rows: ContributionRow[]; totals: ContributionTotals; employees: Array<{ employeeId: string }> } };
const req = (path: string) => new NextRequest(`http://test.local${path}`);
async function contributions(qs: string) {
  const res = await GET(req(`/api/payroll/statutory-contributions?${qs}`));
  return { status: res.status, res, body: res.headers.get("content-type")?.includes("json") ? ((await res.json()) as Body) : null };
}

describeDb("PAY-160 statutory contributions API (real Postgres, RLS)", () => {
  let admin: pg.Client;
  const q = (sql: string, p: unknown[] = []) => admin.query(sql, p);
  const ANA = id("ana"), JOSE = id("jose"), OTHER = id("other");

  async function employee(key: string, tenant: string, first: string, last: string) {
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $1, $3, $4, '2025-01-06', now())`,
      [key, tenant, first, last],
    );
  }
  async function book(key: string, tenant: string, from: string, to: string, status: string, cycle = "SEMI_MONTHLY") {
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"PayFrequency", 'REGULAR', $6::"PayrollBookStatus", now())`,
      [id(key), tenant, from, to, cycle, status],
    );
  }
  /** A sheet; `msc` set means it deducted (SSS with MPF above ₱20,000). */
  async function sheet(bookKey: string, tenant: string, emp: string, msc: number | null) {
    const reg = msc ? Math.min(msc, 2_000_000) : 0;
    const mpf = msc ? Math.max(0, msc - 2_000_000) : 0;
    const v = {
      sssEe: Math.round(reg * 0.05) + Math.round(mpf * 0.05),
      sssEr: Math.round(reg * 0.1) + Math.round(mpf * 0.1),
      sssEc: msc ? 3_000 : 0,
      phEe: msc ? Math.round(msc * 0.025) : 0,
      phEr: msc ? Math.round(msc * 0.025) : 0,
      piEe: msc ? 20_000 : 0,
      piEr: msc ? 20_000 : 0,
    };
    const breakdown = {
      deducted: msc !== null,
      bases: { sssMscCents: String(msc ?? 0), philHealthMscCents: String(msc ?? 0), pagibigMfsCents: msc ? "1000000" : "0" },
      sss: { eeMpfCents: String(Math.round(mpf * 0.05)), erMpfCents: String(Math.round(mpf * 0.1)) },
      sssBasis: { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10" },
    };
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "sssEeCents", "sssErCents", "sssEcCents", "philhealthEeCents", "philhealthErCents", "pagibigEeCents", "pagibigErCents",
         "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', $5, 261, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())`,
      [`${id(bookKey)}-${emp}`, tenant, id(bookKey), emp, msc ?? 0, msc !== null,
        v.sssEe, v.sssEr, v.sssEc, v.phEe, v.phEr, v.piEe, v.piEr, JSON.stringify(breakdown)],
    );
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    for (const [t, code] of [[T, `P160T${sfx}`], [U, `P160U${sfx}`]]) {
      await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [t, code.toUpperCase()]);
    }
    await employee(ANA, T, "Ana", "Santos");
    await employee(JOSE, T, "Jose", "Dela Cruz");
    await employee(OTHER, U, "Other", "Company");
    await book("oct2", T, "2026-10-16", "2026-10-31", "FINALIZED");
    await book("nov1", T, "2026-11-01", "2026-11-15", "FINALIZED");
    await book("nov2", T, "2026-11-16", "2026-11-30", "FINALIZED");
    await book("draft", T, "2026-11-09", "2026-11-15", "DRAFT", "WEEKLY");
    await book("unov", U, "2026-11-01", "2026-11-15", "FINALIZED");
    await sheet("oct2", T, ANA, 3_000_000);
    await sheet("nov1", T, ANA, 3_000_000);
    await sheet("nov1", T, JOSE, 2_500_000);
    await sheet("nov2", T, ANA, null);
    await sheet("nov2", T, JOSE, null);
    await sheet("draft", T, JOSE, 2_500_000);
    await sheet("unov", U, OTHER, 3_500_000);
  });

  afterAll(async () => {
    for (const t of ["PayrollSheet", "PayrollBook", "Employee"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" IN ($1, $2)`, [T, U]);
    }
    await q(`DELETE FROM "Tenant" WHERE id IN ($1, $2)`, [T, U]);
    await admin.end();
  });

  it("D1 (T1) November for everyone, matching the R-3, RF-1 and MCRF", async () => {
    auth.tenantId = T;
    const { status, body } = await contributions("year=2026&month=11");
    expect(status).toBe(200);
    const rows = body!.data.rows;
    expect(rows.map((r) => [r.month, r.name])).toEqual([
      ["2026-11", "Dela Cruz, Jose"],
      ["2026-11", "Santos, Ana"],
    ]);
    const ana = rows.find((r) => r.employeeId === ANA)!;
    expect(ana.sss).toEqual({
      mscCents: "3000000",
      eeRegularCents: "100000",
      erRegularCents: "200000",
      ecCents: "3000",
      eeMpfCents: "50000",
      erMpfCents: "100000",
      eeCents: "150000",
      erCents: "300000",
      totalCents: "453000",
    });
    expect(ana.philhealth).toEqual({ baseCents: "3000000", eeCents: "75000", erCents: "75000", totalCents: "150000" });
    expect(ana.pagibig).toEqual({ baseCents: "1000000", eeCents: "20000", erCents: "20000", totalCents: "40000" });
    expect(ana.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10" });
    // The draft's ₱2,500,000 MSC sheet for Jose is not counted: one deducting sheet only.
    expect(rows.find((r) => r.employeeId === JOSE)!.sss.eeCents).toBe("125000");

    const t = body!.data.totals;
    const r3 = (await (await getR3(req("/api/payroll/reports/sss/r3?year=2026&month=11"))).json()).data.data;
    const rf1 = (await (await getRf1(req("/api/payroll/reports/philhealth/rf1?year=2026&month=11"))).json()).data.data;
    const mcrf = (await (await getMcrf(req("/api/payroll/reports/pagibig/mcrf?year=2026&month=11"))).json()).data.data;
    expect([t.sss.eeCents, t.sss.erCents, t.sss.ecCents, t.sss.totalCents]).toEqual([
      r3.totalSssEeCents, r3.totalSssErCents, r3.totalSssEcCents, r3.totalSssContributionCents,
    ]);
    expect([t.philhealth.eeCents, t.philhealth.erCents, t.philhealth.totalCents]).toEqual([
      rf1.totalPhilhealthEeCents, rf1.totalPhilhealthErCents, rf1.totalPremiumCents,
    ]);
    expect([t.pagibig.eeCents, t.pagibig.erCents, t.pagibig.totalCents]).toEqual([
      mcrf.totalPagibigEeCents, mcrf.totalPagibigErCents, mcrf.totalContributionCents,
    ]);
    expect(t.sss.totalCents).toBe("831000"); // 453,000 + 378,000: vacuity guard
  });

  it("D2 one employee's history, month by month", async () => {
    auth.tenantId = T;
    const { body } = await contributions(`year=2026&employeeId=${ANA}`);
    expect(body!.data.rows.map((r) => [r.month, r.sss.totalCents])).toEqual([
      ["2026-10", "453000"],
      ["2026-11", "453000"],
    ]);
    expect(body!.data.employees.map((e) => e.employeeId).sort()).toEqual([ANA, JOSE].sort());
  });

  it("D3 CSV download", async () => {
    auth.tenantId = T;
    const { status, res } = await contributions("year=2026&month=11&format=csv");
    expect(status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="statutory-contributions-2026-11.csv"');
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe(CONTRIBUTION_CSV_HEADER.join(","));
    expect(lines.filter((l) => l.startsWith("2026-11,"))).toHaveLength(2);
    expect(lines.find((l) => l.startsWith("TOTAL,"))!.split(",").at(-1)).toBe("11860.00"); // Ana 6,430.00 + Jose 5,430.00

    const hist = await contributions(`year=2026&employeeId=${ANA}&format=csv`);
    expect(hist.res.headers.get("content-disposition")).toBe(`attachment; filename="statutory-contributions-2026-${ANA}.csv"`);
  });

  it("D4 a query without a month or an employee, or with month 13, is refused", async () => {
    auth.tenantId = T;
    expect((await contributions("year=2026")).status).toBe(400);
    expect((await contributions("year=2026&month=13")).status).toBe(400);
    expect((await contributions("month=11")).status).toBe(400);
  });

  it("D5 another company's employee gives nothing", async () => {
    auth.tenantId = T;
    const { body } = await contributions(`year=2026&employeeId=${OTHER}`);
    expect(body!.data.rows).toEqual([]);
    expect(body!.data.employees.map((e) => e.employeeId)).not.toContain(OTHER);
    auth.tenantId = U;
    const u = await contributions("year=2026&month=11");
    expect(u.body!.data.rows.map((r) => r.employeeId)).toEqual([OTHER]);
  });
});
