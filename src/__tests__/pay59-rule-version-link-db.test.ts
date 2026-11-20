/**
 * PAY-59 (plan 1.4, R59): "Link a payroll run to the statutory rule VERSION
 * that priced it. Today PayrollBook has no FK to StatutoryRule and
 * PayrollSheet.statutoryBreakdown does not record the version."
 *
 * One employee, monthly 30,000.00. Six statutory tables in force from
 * 1 Jan 2026 (versions p59-<category>), and a second SSS table, version
 * p59-SSS-B, in force from 1 Nov 2026 with the same rates.
 *
 *   D1  a payslip computed for 1 to 15 Oct records the six versions that
 *       priced it: id, version, start date and legal basis (fails on main:
 *       no such column).
 *   D2  a payslip for 1 to 15 Nov records the SSS table in force then
 *       (p59-SSS-B); the other five are unchanged.
 *   D3  recording the version changes no figure: both payslips have the same
 *       gross and net pay.
 *   D4  the run API returns the versions and the run page shows them.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p59t${sfx}`;
const id = (s: string) => `p59${s}${sfx}`;
const ADA = id("ada");
const CATS = ["SSS_SCHEDULE", "PHILHEALTH_SCHEDULE", "PAGIBIG_SCHEDULE", "BIR_WITHHOLDING_TABLE", "MINIMUM_WAGE_RATE", "DE_MINIMIS_CEILING"];

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })), checkPermission: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { createDraftRun } from "@/lib/payroll/persist";
import { GET as getRun } from "@/app/api/payroll/runs/[id]/route";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
type Versions = Record<string, { id: string; version: string; effectiveFrom: string; legalBasis: string }>;

describeDb("PAY-59 a payslip records the statutory rule versions that priced it (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const books: Record<string, string> = {};
  const sheetOf = async (book: string) =>
    (await q(`SELECT "statutoryRuleVersions" v, "grossCompensationCents"::text gross, "netPayCents"::text net, "sssEeCents"::text sss FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book])).rows[0] as { v: Versions; gross: string; net: string; sss: string };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Rule Link Co', $2, now())`, [T, `P59${sfx}`.toUpperCase()]);
    const rule = (key: string, cat: string, from: string, version: string, basis: string, payload: unknown) =>
      q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", $4, $5, $6, $7::jsonb, now())`,
        [id(key), T, cat, from, basis, version, JSON.stringify(payload)],
      );
    const payloads: Record<string, unknown> = {
      SSS_SCHEDULE: SSS, PHILHEALTH_SCHEDULE: PHIC, PAGIBIG_SCHEDULE: PAGIBIG, BIR_WITHHOLDING_TABLE: BIR,
      MINIMUM_WAGE_RATE: MIN_WAGE,
      DE_MINIMIS_CEILING: { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] },
    };
    for (const cat of CATS) await rule(cat, cat, "2026-01-01", `p59-${cat}`, `basis of ${cat}`, payloads[cat]);
    await rule("sssb", "SSS_SCHEDULE", "2026-11-01", "p59-SSS-B", "SSS circular B", SSS);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "salaryType", "updatedAt")
       VALUES ($1, $2, 'E-ADA', 'Ada', 'Link', '2025-01-06', false, 'MONTHLY', now())`,
      [ADA, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`,
      [`${ADA}-t`, T, ADA],
    );
    for (const [key, s, e] of [["oct", "2026-10-01", "2026-10-15"], ["nov", "2026-11-01", "2026-11-15"]]) {
      books[key!] = (await createDraftRun({ tenantId: T, periodStart: d(s!), periodEnd: d(e!), cycle: "SEMI_MONTHLY", runType: "REGULAR" })).id;
    }
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the October payslip records the six versions that priced it", async () => {
    const { v } = await sheetOf(books.oct!);
    expect(Object.keys(v).sort()).toEqual([...CATS].sort());
    for (const cat of CATS) {
      expect(v[cat]).toEqual({ id: id(cat), version: `p59-${cat}`, effectiveFrom: "2026-01-01", legalBasis: `basis of ${cat}` });
    }
  });

  it("D2 the November payslip records the SSS table in force in November", async () => {
    const { v } = await sheetOf(books.nov!);
    expect(v.SSS_SCHEDULE).toEqual({ id: id("sssb"), version: "p59-SSS-B", effectiveFrom: "2026-11-01", legalBasis: "SSS circular B" });
    for (const cat of CATS.slice(1)) expect(v[cat]!.version).toBe(`p59-${cat}`);
  });

  it("D3 recording the version changes no figure", async () => {
    const oct = await sheetOf(books.oct!);
    const nov = await sheetOf(books.nov!);
    expect(oct.gross).toBe("1500000");
    expect([nov.gross, nov.net, nov.sss]).toEqual([oct.gross, oct.net, oct.sss]);
  });

  it("D4 the run API returns the versions and the run page shows them", async () => {
    const res = await getRun(new NextRequest(`http://localhost/api/payroll/runs/${books.nov}`), { params: Promise.resolve({ id: books.nov! }) });
    expect(res.status).toBe(200);
    const run = (await res.json()).data;
    expect(run.sheets[0].statutoryRuleVersions.SSS_SCHEDULE.version).toBe("p59-SSS-B");
    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(page).toContain("<RuleVersionsLine sheets={run.sheets} />");
    expect(page).toContain("Statutory tables used:");
  });
});
