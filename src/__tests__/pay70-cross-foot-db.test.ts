/**
 * PAY-70 against real Postgres: every document carries its cross-foot checks
 * and they tie out for a consistent finalized run; a payslip changed behind
 * the application's back is caught.
 *
 * One finalized run, 1 to 15 Nov 2026, two payslips:
 *   Ana: gross 33,300.00; SSS 1,000.00 (+ employer 2,000.00, EC 30.00);
 *     PhilHealth 625.00 (+ 625.00); Pag-IBIG 200.00 (+ 200.00); tax 2,864.50;
 *     net 28,610.50.
 *   Ben: gross 9,000.00, other deduction 9,400.00, net (400.00).
 * Month: SSS 3,030.00, PhilHealth 1,250.00, Pag-IBIG 400.00, tax 2,864.50.
 *
 *   D1  the run: (1), (2) and (3) tie out; the bank file credits 28,610.50.
 *   D2  SSS R-3, PhilHealth RF-1, Pag-IBIG MCRF and BIR 1601-C each tie to
 *       the month's payslips.
 *   D3  the 2316s tie to the payslips and the 1604-C alphalist to the 2316s.
 *   D4  a payslip's net pay changed in the database: the run no longer ties
 *       out, and says which payslip.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR } from "./fixtures/statutory-test-rules";
import type { CrossFootCheck } from "@/lib/payroll/reports/cross-foot";

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p70t${sfx}`;
const id = (s: string) => `p70${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })), checkPermission: vi.fn(async () => true) }));

import { GET as runCrossFoot } from "@/app/api/payroll/runs/[id]/cross-foot/route";
import { GET as r3 } from "@/app/api/payroll/reports/sss/r3/route";
import { GET as rf1 } from "@/app/api/payroll/reports/philhealth/rf1/route";
import { GET as mcrf } from "@/app/api/payroll/reports/pagibig/mcrf/route";
import { GET as bir1601c } from "@/app/api/payroll/reports/bir/1601c/route";
import { GET as bir2316 } from "@/app/api/payroll/reports/bir/2316/route";
import { GET as bir1604c } from "@/app/api/payroll/reports/bir/1604c/route";

const get = (url: string) => new NextRequest(`http://localhost${url}`);
/** The report body, whichever way the route wraps it. */
const body = async (res: Response) => {
  expect(res.status).toBe(200);
  const j = (await res.json()).data;
  return (j.data ?? j) as { crossFoot: CrossFootCheck[] } & Record<string, unknown>;
};
const by = (list: CrossFootCheck[], cid: string) => list.find((x) => x.id === cid)!;

describeDb("PAY-70 cross-foot checks on every document (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const run = async () => (await (await runCrossFoot(get(`/api/payroll/runs/${id("book")}/cross-foot`), { params: Promise.resolve({ id: id("book") }) })).json()).data;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala Trading Inc.', $2, now())`, [T, `P70${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
       VALUES ($1, $2, 'BIR_WITHHOLDING_TABLE', '2026-01-01', 'test', 'p70-bir', $3::jsonb, now())`,
      [id("bir"), T, JSON.stringify(BIR)],
    );
    for (const [key, first, last] of [["ana", "Ana", "Santos"], ["ben", "Ben", "Cruz"]]) {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, '2025-01-06', now())`,
        [id(key!), T, `E-${key}`, first, last],
      );
    }
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, '2026-11-01', '2026-11-15', 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', now())`,
      [id("book"), T],
    );
    const sheet = (key: string, n: Record<string, number>) =>
      q(
        `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
           "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
           "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
           "sssEeCents", "sssErCents", "sssEcCents", "philhealthEeCents", "philhealthErCents", "pagibigEeCents", "pagibigErCents",
           "adjustmentDeductionsCents", "netPayCents",
           "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
         VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 5000000, 261, true,
           $5, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $13, $14, $15, '[]', '[]', '{}', '{}', now())`,
        [`${id(key)}-s`, T, id("book"), id(key), n.gross, n.ee, n.taxable, n.tax, n.sss, n.sssEr, n.ec, n.ph, n.hdmf, n.other, n.net],
      );
    await sheet("ana", { gross: 3330000, ee: 182500, taxable: 3147500, tax: 286450, sss: 100000, sssEr: 200000, ec: 3000, ph: 62500, hdmf: 20000, other: 0, net: 2861050 });
    await sheet("ben", { gross: 900000, ee: 0, taxable: 900000, tax: 0, sss: 0, sssEr: 0, ec: 0, ph: 0, hdmf: 0, other: 940000, net: -40000 });
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the run ties out on (1), (2) and (3)", async () => {
    const r = await run();
    expect(r.tiesOut).toBe(true);
    expect(r.checks.map((x: CrossFootCheck) => x.id)).toEqual(["Q4-1", "Q4-2", "Q4-2x", "Q4-3"]);
    expect(r.register).toMatchObject({ payslips: "2", grossCents: "4230000", withholdingTaxCents: "286450", otherDeductionsCents: "940000", netPayCents: "2821050" });
    expect(by(r.checks, "Q4-3")).toMatchObject({ expectedCents: "2861050", actualCents: "2861050", ok: true });
    expect(by(r.checks, "Q4-3").detail).toContain("1 payslip(s) with zero or negative net pay");
  });

  it("D2 the month's remittances tie to the payslips", async () => {
    const qs = "?year=2026&month=11";
    const sss = await body(await r3(get(`/api/payroll/reports/sss/r3${qs}`)));
    expect(sss.crossFoot).toEqual([expect.objectContaining({ id: "Q4-4a", ok: true, expectedCents: "303000", actualCents: "303000" })]);
    const ph = await body(await rf1(get(`/api/payroll/reports/philhealth/rf1${qs}`)));
    expect(ph.crossFoot).toEqual([expect.objectContaining({ id: "Q4-4b", ok: true, expectedCents: "125000", actualCents: "125000" })]);
    const hdmf = await body(await mcrf(get(`/api/payroll/reports/pagibig/mcrf${qs}`)));
    expect(hdmf.crossFoot).toEqual([expect.objectContaining({ id: "Q4-4c", ok: true, expectedCents: "40000", actualCents: "40000" })]);
    const bir = await body(await bir1601c(get(`/api/payroll/reports/bir/1601c${qs}`)));
    expect(bir.crossFoot).toEqual([expect.objectContaining({ id: "Q4-5", ok: true, expectedCents: "286450", actualCents: "286450" })]);
  });

  it("D3 the 2316s tie to the payslips and the alphalist to the 2316s", async () => {
    const certs = await body(await bir2316(get("/api/payroll/reports/bir/2316?year=2026")));
    expect(certs.crossFoot.map((x) => [x.id, x.ok, x.actualCents])).toEqual([
      ["Q4-6a", true, "4230000"], ["Q4-6b", true, "4047500"], ["Q4-6c", true, "286450"],
    ]);
    const one = await body(await bir2316(get(`/api/payroll/reports/bir/2316?year=2026&employeeId=${id("ana")}`)));
    expect(one.crossFoot.map((x) => [x.id, x.ok, x.actualCents])).toEqual([
      ["Q4-6a", true, "3330000"], ["Q4-6b", true, "3147500"], ["Q4-6c", true, "286450"],
    ]);
    const alpha = await body(await bir1604c(get("/api/payroll/reports/bir/1604c?year=2026")));
    expect(alpha.crossFoot.map((x) => x.id)).toEqual(["Q4-6d", "Q4-6e", "Q4-6f", "Q4-6a", "Q4-6b", "Q4-6c"]);
    expect(alpha.crossFoot.every((x) => x.ok)).toBe(true);
    expect(by(alpha.crossFoot, "Q4-6d")).toMatchObject({ expectedCents: "4230000", actualCents: "4230000" });
    expect(by(alpha.crossFoot, "Q4-6f")).toMatchObject({ expectedCents: "286450", actualCents: "286450" });
  });

  it("D4 a payslip changed in the database is caught", async () => {
    await q(`UPDATE "PayrollSheet" SET "netPayCents" = 2871050 WHERE id = $1`, [`${id("ana")}-s`]);
    try {
      const r = await run();
      expect(r.tiesOut).toBe(false);
      expect(by(r.checks, "Q4-1")).toMatchObject({ ok: false, expectedCents: "2821050", actualCents: "2831050" });
      expect(by(r.checks, "Q4-1").detail).toBe("1 payslip(s) do not add up, first: Santos, Ana (E-ana).");
      expect(by(r.checks, "Q4-2").ok).toBe(true);
      expect(by(r.checks, "Q4-2x").ok).toBe(false);
    } finally {
      await q(`UPDATE "PayrollSheet" SET "netPayCents" = 2861050 WHERE id = $1`, [`${id("ana")}-s`]);
    }
  });
});
