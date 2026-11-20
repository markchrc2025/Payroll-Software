/**
 * PAY-71 part 1, against real Postgres: the 1601-C and 2316 routes read the
 * finalized payslips, the company and the employee's stored (encrypted) TIN.
 *
 * One finalized payslip (Ana, 1 to 15 Nov 2026, the figures of the pure
 * test: gross 33,300.00, exempt 3,825.00, taxable 29,475.00, tax 2,864.50)
 * and one draft payslip that must not be counted.
 *
 *   D1  1601-C: Items 14 to 25 from the finalized payslip only; Part I has
 *       the company's TIN, address and contact details.
 *   D2  2316: the employee's TIN is decrypted and printed the BIR way; the
 *       period, address and Items 19 to 52 are filled; tax due is worked
 *       from the BIR table in force.
 *   D3  the stored TIN ciphertext never leaves the server.
 *   D4  1604-C (part 2): the finalized payslip is one row of Schedule 1 and
 *       November's tax in Part II; the draft run is not counted.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, MIN_WAGE } from "./fixtures/statutory-test-rules";

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p71t${sfx}`;
const id = (s: string) => `p71${s}${sfx}`;
const ANA = id("ana");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })), checkPermission: vi.fn(async () => true) }));

import { encrypt } from "@/lib/crypto";
import { formatCentavos, type BirFormView } from "@/lib/payroll/reports/bir-form";
import { GET as bir1601c } from "@/app/api/payroll/reports/bir/1601c/route";
import { GET as bir2316 } from "@/app/api/payroll/reports/bir/2316/route";
import { GET as bir1604c } from "@/app/api/payroll/reports/bir/1604c/route";

const get = (url: string) => new NextRequest(`http://localhost${url}`);
const line = (view: BirFormView, no: string) => {
  for (const s of view.sections) for (const l of s.lines) if (l.no === no) return l;
  throw new Error(`no item ${no}`);
};
const amount = (view: BirFormView, no: string) => formatCentavos(line(view, no).value ?? "0");

describeDb("PAY-71 BIR 1601-C and 2316 (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let tinCipher = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(
      `INSERT INTO "Tenant" (id, name, "companyCode", "tinNumber", address, city, "zipCode", "contactPhone", "contactEmail", "updatedAt")
       VALUES ($1, 'Tala Trading Inc.', $2, $3, '12 Shoe Avenue', 'Marikina City', '1800', '0281234567', 'accounts@tala.test', now())`,
      [T, `P71${sfx}`.toUpperCase(), `9${sfx.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}000`],
    );
    for (const [cat, payload] of [["BIR_WITHHOLDING_TABLE", BIR], ["MINIMUM_WAGE_RATE", MIN_WAGE]] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p71-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "middleName", "lastName", "hireDate", "birthDate",
         "addressLine1", city, "zipCode", "mobileNumber", region, "updatedAt")
       VALUES ($1, $2, 'E-ANA', 'Ana', 'Reyes', 'Santos', '2026-06-15', '1990-03-09', '5 Bayan Street', 'Marikina City', '1801', '09171234567', 'NCR', now())`,
      [ANA, T],
    );
    tinCipher = encrypt("111-222-333-000")!;
    await q(
      `INSERT INTO "StatutoryId" (id, "tenantId", "employeeId", type, number, "updatedAt") VALUES ($1, $2, $3, 'TIN', $4, now())`,
      [id("tin"), T, ANA, tinCipher],
    );
    const book = async (key: string, start: string, end: string, status: string) =>
      q(
        `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
         VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', $5::"PayrollBookStatus", now())`,
        [id(key), T, start, end, status],
      );
    const components = JSON.stringify([
      { id: "a", code: "ALLOW", name: "Allowance", kind: "ALLOWANCE", taxability: "TAXABLE", amountCents: "100000", nonTaxablePortionCents: "0", taxablePortionCents: "100000" },
      { id: "r", code: "RICE", name: "Rice", kind: "ALLOWANCE", taxability: "DE_MINIMIS", amountCents: "250000", nonTaxablePortionCents: "200000", taxablePortionCents: "50000" },
      { id: "c", code: "COMM", name: "Commission", kind: "COMMISSION", taxability: "TAXABLE", amountCents: "300000", nonTaxablePortionCents: "0", taxablePortionCents: "300000" },
    ]);
    const sheet = async (bookKey: string) =>
      q(
        `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
           "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
           "basePayCents", "lateUndertimeDeductionCents", "otPayCents", "nsdPayCents", "holidayPayCents",
           "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
           "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents",
           "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
         VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 5000000, 261, true,
           2500000, 50000, 120000, 30000, 80000,
           3330000, 382500, 2947500, 286450,
           100000, 62500, 20000, 2861050,
           $5::jsonb, '[]', '{}', '{}', now())`,
        [`${id(bookKey)}-s`, T, id(bookKey), ANA, components],
      );
    await book("nov1", "2026-11-01", "2026-11-15", "FINALIZED");
    await sheet("nov1");
    await book("nov2", "2026-11-16", "2026-11-30", "DRAFT");
    await sheet("nov2");
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["StatutoryId", "Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 1601-C reads the finalized payslip and the company", async () => {
    const res = await bir1601c(get("/api/payroll/reports/bir/1601c?year=2026&month=11"));
    expect(res.status).toBe(200);
    const report = (await res.json()).data;
    const form = report.form as BirFormView;
    expect(amount(form, "14")).toBe("33,300.00");
    expect(amount(form, "18")).toBe("2,000.00");
    expect(amount(form, "19")).toBe("1,825.00");
    expect(amount(form, "21")).toBe("3,825.00");
    expect(amount(form, "22")).toBe("29,475.00");
    expect(amount(form, "23")).toBe("0.00");
    expect(amount(form, "25")).toBe("2,864.50");
    expect(line(form, "6").value).toMatch(/^\d{3}-\d{3}-\d{3}-00000$/);
    expect(line(form, "8").value).toBe("Tala Trading Inc.");
    expect(line(form, "9").value).toBe("12 Shoe Avenue, Marikina City");
    expect(line(form, "9A").value).toBe("1800");
    expect(line(form, "10").value).toBe("0281234567");
    expect(line(form, "12").value).toBe("accounts@tala.test");
    expect(report.payeeCount).toBe(1);
    expect(report.entries[0].tin).toBe("111-222-333-00000");
  });

  it("D2 2316 prints the employee's TIN and fills Items 1 to 52", async () => {
    const res = await bir2316(get(`/api/payroll/reports/bir/2316?year=2026&employeeId=${ANA}`));
    expect(res.status).toBe(200);
    const cert = (await res.json()).data;
    const form = cert.form as BirFormView;
    expect(cert.tin).toBe("111-222-333-00000");
    expect(line(form, "2").value).toBe("06/15 to 12/31");
    expect(line(form, "3").value).toBe("111-222-333-00000");
    expect(line(form, "4").value).toBe("Santos, Ana, Reyes");
    expect(line(form, "6").value).toBe("5 Bayan Street, Marikina City");
    expect(line(form, "6A").value).toBe("1801");
    expect(line(form, "7").value).toBe("03/09/1990");
    expect(line(form, "8").value).toBe("09171234567");
    expect(line(form, "13").value).toBe("Tala Trading Inc.");
    expect(amount(form, "19")).toBe("33,300.00");
    expect(amount(form, "35")).toBe("2,000.00");
    expect(amount(form, "36")).toBe("1,825.00");
    expect(amount(form, "38")).toBe("3,825.00");
    expect(amount(form, "39")).toBe("22,675.00");
    expect(amount(form, "44A")).toBe("1,500.00");
    expect(amount(form, "45")).toBe("3,000.00");
    expect(amount(form, "50")).toBe("1,200.00");
    expect(amount(form, "51A")).toBe("1,100.00");
    expect(amount(form, "52")).toBe("29,475.00");
    // 29,475.00 for the year is under the table's first taxed bracket: no tax due.
    expect(line(form, "24").value).toBe("0");
    expect(amount(form, "25A")).toBe("2,864.50");
    expect(form.footnotes.join(" ")).toContain("Tax withheld (Item 26) is more than tax due (Item 24) by 2,864.50.");
  });

  it("D3 the stored ciphertext is never returned", async () => {
    const a = await (await bir1601c(get("/api/payroll/reports/bir/1601c?year=2026&month=11"))).text();
    const b = await (await bir2316(get("/api/payroll/reports/bir/2316?year=2026"))).text();
    expect(tinCipher.startsWith("v1:")).toBe(true);
    const c = await (await bir1604c(get("/api/payroll/reports/bir/1604c?year=2026"))).text();
    for (const body of [a, b, c]) {
      expect(body).not.toContain(tinCipher);
      expect(body).not.toContain("v1:");
    }
  });

  it("D4 1604-C: one Schedule 1 row and November in Part II", async () => {
    const res = await bir1604c(get("/api/payroll/reports/bir/1604c?year=2026"));
    expect(res.status).toBe(200);
    const report = (await res.json()).data;
    const form = report.form as BirFormView;
    expect(report.employeeCount).toBe(1);
    expect(report.mweCount).toBe(0);
    expect(line(form, "4").value).toMatch(/^\d{3}-\d{3}-\d{3}-00000$/);
    expect(line(form, "6").value).toBe("Tala Trading Inc.");
    const [part2, s1, s2] = form.schedules;
    const at = (no: string) => s1!.columns.findIndex((col) => col.no === no);
    const ana = s1!.rows[0]!;
    expect(s1!.rows).toHaveLength(1);
    expect(s2!.rows).toHaveLength(0);
    expect([ana[at("2a")], ana[at("2b")], ana[at("2c")]]).toEqual(["Santos", "Ana", "Reyes"]);
    expect(ana[at("4")]).toBe("P");
    expect([ana[at("5a")], ana[at("5b")]]).toEqual(["06/15", "12/31"]);
    expect(formatCentavos(ana[at("7a")]!)).toBe("33,300.00");
    expect(formatCentavos(ana[at("7f")]!)).toBe("3,825.00");
    expect(formatCentavos(ana[at("7g")]!)).toBe("22,675.00");
    expect(formatCentavos(ana[at("7i")]!)).toBe("6,800.00");
    expect(formatCentavos(ana[at("7j")]!)).toBe("29,475.00");
    expect(formatCentavos(ana[at("15b")]!)).toBe("2,864.50");
    expect(formatCentavos(ana[at("18")]!)).toBe("2,864.50");
    expect(ana[at("19")]).toBe("No");
    expect(formatCentavos(part2!.rows[10]![4]!)).toBe("2,864.50");
    expect(formatCentavos(part2!.totals![4]!)).toBe("2,864.50");
    expect(report.monthlyWithholdingCents[11]).toBe("0");
  });
});
