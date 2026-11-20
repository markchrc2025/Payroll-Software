/**
 * PAY-66 (plan 1.11, launch gate 6): a full payroll cycle ties out to the
 * centavo. One month, two semi-monthly regular runs, created, computed and
 * finalized through the app's own code; then every output is read through its
 * own route and compared with the finalized sheets:
 *
 *   payslips, SSS R-3, PhilHealth RF-1, Pag-IBIG MCRF, the BDO bank file,
 *   and BIR 1601-C.
 *
 * Company (October 2026, contributions on the first cutoff):
 *   Ada   monthly 30,000.00; 2 h overtime and 30 min late on 1 to 15 Oct;
 *         rice allowance 1,000.00 a payroll (taxable)
 *   Ben   daily 695.00, 11 days each cutoff
 *   Cora  monthly 25,000.00; company loan 2,000.00 a payroll; uniform
 *         deduction 500.00 a payroll, authorized; no bank account
 *
 *   T1  each payslip adds up: earnings = gross; gross - deductions +
 *       additions = net (no balancing "Other items" line), and its net is the
 *       sheet's net.
 *   T2  the bank file of each run: the header total = the sum of its lines =
 *       the sum of the sheets' net pay; one line per paid employee.
 *   T3  SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF for the month = the sum of
 *       the month's sheets, per employee and in total (employee and employer
 *       shares).
 *   T4  BIR 1601-C for the month: tax withheld, gross, taxable and
 *       non-taxable = the sum of the month's sheets; gross = taxable +
 *       non-taxable.
 *   T5  the month's cash ties: gross + additions after tax = net pay + tax +
 *       employee contributions + loans + other deductions.
 *   T6  hand check of one figure in each output (Ada, 1 to 15 Oct).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p66t${sfx}`;
const id = (s: string) => `p66${s}${sfx}`;
const ADA = id("ada");
const BEN = id("ben");
const CORA = id("cora");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })), checkPermission: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { createDraftRun, finalizeRun } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";
import { loadPayslipPdfData } from "@/lib/payslip/pdf-data";
import { GET as sssR3 } from "@/app/api/payroll/reports/sss/r3/route";
import { GET as rf1 } from "@/app/api/payroll/reports/philhealth/rf1/route";
import { GET as mcrf } from "@/app/api/payroll/reports/pagibig/mcrf/route";
import { GET as bir1601c } from "@/app/api/payroll/reports/bir/1601c/route";
import { GET as bdo } from "@/app/api/payroll/runs/[id]/bank-files/bdo/route";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const cents = (pesos: string) => BigInt(pesos.replace(".", ""));
/** The report inside a route's answer (some routes wrap it once more in `data`). */
const report = async (res: Response) => {
  expect(res.status).toBe(200);
  const body = (await res.json()).data;
  return body?.data ?? body;
};

interface Sheet {
  employeeId: string; book: string; gross: bigint; taxable: bigint; tax: bigint; net: bigint;
  sssEe: bigint; sssEr: bigint; sssEc: bigint; phEe: bigint; phEr: bigint; hdmfEe: bigint; hdmfEr: bigint;
  loans: bigint; other: bigint; additions: bigint; mwe: bigint; ntBasic: bigint; ntComp: bigint; nt13: bigint; ot: bigint; late: bigint;
}

describeDb("PAY-66 full-cycle tie-out (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const books: string[] = [];
  let sheets: Sheet[] = [];
  const sum = (f: (s: Sheet) => bigint, rows = sheets) => rows.reduce((t, s) => t + f(s), 0n);
  const of = (emp: string) => sheets.filter((s) => s.employeeId === emp);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tie Out Co', $2, now())`, [T, `P66${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p66-${cat}`, JSON.stringify(payload)],
      );
    }
    const emp = async (e: string, first: string, salary: number, type: string, bank: string | null) => {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "bankAccountNumber", "bankAccountName", "salaryType", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Tie', '2025-01-06', false, $5, $6, $7::"SalaryType", now())`,
        [e, T, `E-${first.toUpperCase()}`, first, bank, bank ? `${first} Tie` : null, type],
      );
      await q(
        `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
         VALUES ($1, $2, $3, '2025-01-06', $4, $5::"SalaryType", now())`,
        [`${e}-t`, T, e, salary, type],
      );
    };
    await emp(ADA, "Ada", 3_000_000, "MONTHLY", "001234567890");
    await emp(BEN, "Ben", 69_500, "DAILY", "009876543210");
    await emp(CORA, "Cora", 2_500_000, "MONTHLY", null);
    const comp = async (key: string, kind: string, taxability: string, e: string, amount: number, authorized = false) => {
      await q(`INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "updatedAt") VALUES ($1, $2, $3, $4, $5::"PayComponentKind", $6::"PayComponentTaxability", now())`,
        [id(key), T, key.toUpperCase(), key === "rice" ? "Rice allowance" : "Uniform", kind, taxability]);
      await q(
        `INSERT INTO "EmployeePayComponent" (id, "tenantId", "employeeId", "payComponentId", "amountCents", "effectiveFrom", "authorizationDate", "authorizationFileKey", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, '2026-10-01', $6, $7, now())`,
        [`${id(key)}-a`, T, e, id(key), amount, authorized ? "2026-09-30" : null, authorized ? `tenants/${T}/deduction-authorizations/3f0c1a52-1111-4222-8333-444455556666.pdf` : null],
      );
    };
    await comp("rice", "ALLOWANCE", "TAXABLE", ADA, 100_000);
    await comp("uniform", "DEDUCTION", "NON_TAXABLE", CORA, 50_000, true);
    await q(
      `INSERT INTO "Loan" (id, "tenantId", "employeeId", "loanType", "principalCents", "installmentCents", "balanceCents", "startDate", "updatedAt")
       VALUES ($1, $2, $3, 'COMPANY', 1000000, 200000, 1000000, '2026-10-01', now())`,
      [id("loan"), T, CORA],
    );
    const input = (key: string, e: string, start: string, end: string, cols: Record<string, number>) =>
      q(
        `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd", ${Object.keys(cols).map((c) => `"${c}"`).join(", ")}, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, ${Object.keys(cols).map((_, i) => `$${i + 6}`).join(", ")}, now())`,
        [id(key), T, e, `${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`, ...Object.values(cols)],
      );
    await input("ada1", ADA, "2026-10-01", "2026-10-15", { regularOtHours: 2, lateUndertimeMinutes: 30 });
    await input("ben1", BEN, "2026-10-01", "2026-10-15", { daysWorked: 11 });
    await input("ben2", BEN, "2026-10-16", "2026-10-31", { daysWorked: 11 });

    for (const [s, e] of [["2026-10-01", "2026-10-15"], ["2026-10-16", "2026-10-31"]]) {
      const b = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await finalizeRun(T, b.id, null);
      books.push(b.id);
    }
    sheets = (await q(
      `SELECT "employeeId", "payrollBookId" book, "grossCompensationCents"::text gross, "grossTaxableIncomeCents"::text taxable,
              "withholdingTaxCents"::text tax, "netPayCents"::text net, "sssEeCents"::text "sssEe", "sssErCents"::text "sssEr", "sssEcCents"::text "sssEc",
              "philhealthEeCents"::text "phEe", "philhealthErCents"::text "phEr", "pagibigEeCents"::text "hdmfEe", "pagibigErCents"::text "hdmfEr",
              "loanDeductionsCents"::text loans, "adjustmentDeductionsCents"::text other, "nontaxableAdditionsCents"::text additions,
              "mweExemptCompensationCents"::text mwe, "nontaxableBasicCents"::text "ntBasic", "nontaxableCompensationCents"::text "ntComp",
              "nontaxable13MonthAndBenefitsCents"::text nt13, "otPayCents"::text ot, "lateUndertimeDeductionCents"::text late
         FROM "PayrollSheet" WHERE "tenantId" = $1`,
      [T],
    )).rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "employeeId" || k === "book" ? v : BigInt(v as string)])) as unknown as Sheet);
    expect(sheets).toHaveLength(6);
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "Loan", "EmployeePayComponent", "PayComponent", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("T1 every payslip adds up and shows the sheet's net pay", async () => {
    for (const s of sheets) {
      const p = await withTenant(T, (tx) => loadPayslipPdfData(tx, { tenantId: T, bookId: s.book, employeeId: s.employeeId }));
      const earnings = p.earnings.reduce((t, l) => t + l.amount, 0n);
      expect(earnings).toBe(s.gross);
      expect(p.gross).toBe(s.gross);
      expect(p.net.rows.map((r) => r.label)).not.toContain("Other items");
      expect(p.gross - p.statutoryTotal - p.otherTotal + p.additionsTotal).toBe(s.net);
      expect(p.net.netPay).toBe(s.net);
      expect(p.statutoryTotal).toBe(s.sssEe + s.phEe + s.hdmfEe + s.tax);
      expect(p.otherTotal).toBe(s.loans + s.other);
    }
  });

  it("T2 each run's bank file totals the run's net pay", async () => {
    for (const book of books) {
      const res = await bdo(get(`/api/payroll/runs/${book}/bank-files/bdo`), { params: Promise.resolve({ id: book }) });
      expect(res.status).toBe(200);
      const lines = (await res.text()).trim().split("\r\n").map((l) => l.split("|"));
      const header = lines[0];
      const detail = lines.slice(1);
      const mine = sheets.filter((s) => s.book === book);
      expect(header[0]).toBe("H");
      expect(cents(header[4])).toBe(sum((s) => s.net, mine));
      expect(detail.reduce((t, l) => t + cents(l[4]), 0n)).toBe(cents(header[4]));
      expect(Number(header[5])).toBe(mine.length);
      expect(detail).toHaveLength(mine.length);
    }
  });

  it("T3 SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF equal the month's sheets", async () => {
    const r3 = await report(await sssR3(get("/api/payroll/reports/sss/r3?year=2026&month=10")));
    expect(BigInt(r3.totalSssEeCents)).toBe(sum((s) => s.sssEe));
    expect(BigInt(r3.totalSssErCents)).toBe(sum((s) => s.sssEr));
    expect(BigInt(r3.totalSssEcCents)).toBe(sum((s) => s.sssEc));
    expect(BigInt(r3.totalSssContributionCents)).toBe(sum((s) => s.sssEe + s.sssEr + s.sssEc));
    const ph = await report(await rf1(get("/api/payroll/reports/philhealth/rf1?year=2026&month=10")));
    expect(BigInt(ph.totalPhilhealthEeCents)).toBe(sum((s) => s.phEe));
    expect(BigInt(ph.totalPhilhealthErCents)).toBe(sum((s) => s.phEr));
    const pi = await report(await mcrf(get("/api/payroll/reports/pagibig/mcrf?year=2026&month=10")));
    expect(BigInt(pi.totalPagibigEeCents)).toBe(sum((s) => s.hdmfEe));
    expect(BigInt(pi.totalPagibigErCents)).toBe(sum((s) => s.hdmfEr));
    for (const e of [ADA, BEN, CORA]) {
      const row = (list: { employeeId: string }[]) => list.find((x) => x.employeeId === e) as Record<string, string> | undefined;
      expect(BigInt(row(r3.entries)!.sssEeCents)).toBe(sum((s) => s.sssEe, of(e)));
      expect(BigInt(row(ph.entries)!.philhealthEeCents)).toBe(sum((s) => s.phEe, of(e)));
      expect(BigInt(row(pi.entries)!.pagibigEeCents)).toBe(sum((s) => s.hdmfEe, of(e)));
    }
    expect(sum((s) => s.sssEe)).toBeGreaterThan(0n);
  });

  it("T4 BIR 1601-C equals the month's sheets", async () => {
    const r = await report(await bir1601c(get("/api/payroll/reports/bir/1601c?year=2026&month=10")));
    expect(BigInt(r.totalWithholdingTaxCents)).toBe(sum((s) => s.tax));
    expect(BigInt(r.totalGrossCompensationCents)).toBe(sum((s) => s.gross));
    expect(BigInt(r.totalTaxableCompensationCents)).toBe(sum((s) => s.taxable));
    expect(BigInt(r.totalNonTaxableCompensationCents)).toBe(sum((s) => s.mwe + s.ntBasic + s.ntComp + s.nt13));
    expect(BigInt(r.totalGrossCompensationCents)).toBe(BigInt(r.totalTaxableCompensationCents) + BigInt(r.totalNonTaxableCompensationCents));
    expect(r.payeeCount).toBe(3);
    expect(sum((s) => s.tax)).toBeGreaterThan(0n);
  });

  it("T5 the month's cash ties out", () => {
    expect(sum((s) => s.gross + s.additions)).toBe(sum((s) => s.net + s.tax + s.sssEe + s.phEe + s.hdmfEe + s.loans + s.other));
    expect(sum((s) => s.loans)).toBe(400_000n);
    expect(sum((s) => s.other)).toBe(100_000n);
  });

  it("T6 hand check: Ada, 1 to 15 Oct", () => {
    // Daily 30,000 x 12 / 261 = 1,379.31; hourly 172.41. OT 2 h x 172.41 x 1.25 = 431.03 (431.025 half-up);
    // late 30 min = 86.21. Gross 15,000 - 86.21 + 431.03 + 1,000 rice = 16,344.82.
    // First cutoff: SSS 1,500.00 (5% of 30,000), PhilHealth 750.00, Pag-IBIG 200.00.
    // Taxable 16,344.82 - 2,450 = 13,894.82; tax (13,894.82 - 10,417) x 15% = 521.67 (521.673).
    // Net 16,344.82 - 2,450 - 521.67 = 13,373.15.
    const s = sheets.find((x) => x.employeeId === ADA && x.book === books[0])!;
    expect({ ot: s.ot, late: s.late, gross: s.gross, sss: s.sssEe, ph: s.phEe, hdmf: s.hdmfEe, taxable: s.taxable, tax: s.tax, net: s.net }).toEqual({
      ot: 43_103n, late: 8_621n, gross: 1_634_482n, sss: 150_000n, ph: 75_000n, hdmf: 20_000n, taxable: 1_389_482n, tax: 52_167n, net: 1_337_315n,
    });
  });
});
