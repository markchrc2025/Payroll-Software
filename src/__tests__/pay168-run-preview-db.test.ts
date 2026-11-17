/**
 * PAY-168 (Mark, 17 Nov 2026 14:45): clicking an employee line on a payroll
 * run opens a preview of the payslip (draft runs included), and a 13th month
 * (Year-End) run shows the 13th month instead of an unlabelled "Gross".
 *
 *   Y1  (T1) a 13th month run stores how the 13th month was worked out:
 *       basic pay on the year's finalized regular runs plus basic before
 *       Sentire, divided by 12, less 13th month already paid; and that is
 *       exactly the 13th month the sheet pays.
 *   Y2  the payslip of a draft 13th month run is a preview, with the 13th
 *       month, its tax-free part and taxable excess (which add up to it) and
 *       the working above.
 *   Y3  once annualized, the payslip splits the tax into the tax on the
 *       excess and the year-end adjustment, which add up to the tax withheld.
 *   Y4  a regular run's payslip has no 13th month section and is not a
 *       preview unless asked.
 *   Y5  the page and the API: every employee line of a draft or finalized
 *       run opens the payslip (a preview on a draft); the API serves a draft
 *       as a preview; a Year-End run's columns say 13th Month Pay; the
 *       payslip shows the preview banner and no PDF download on a preview.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { PayrollSheet } from "@prisma/client";
import { createDraftRun } from "@/lib/payroll/persist";
import { runAnnualization } from "@/lib/payroll/annualize";
import { renderPayslip } from "@/lib/payslip/render";
import { withTenant } from "@/lib/with-tenant";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p168t${sfx}`;
const id = (s: string) => `p168${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-168 run sheet preview and the 13th month (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const A = id("a");
  let yearEndId = "";
  let regularId = "";

  async function sheetRow(bookId: string): Promise<PayrollSheet> {
    const r = await withTenant(T, (tx) => tx.payrollSheet.findFirst({ where: { payrollBookId: bookId, employeeId: A } }));
    return r!;
  }
  function render(sheet: PayrollSheet, runType: "YEAR_END" | "REGULAR", preview?: boolean) {
    return renderPayslip({
      sheet,
      employee: {
        id: A, employeeNumber: A, firstName: "P168", middleName: null, lastName: "Test", suffix: null,
        taxClassification: "REGULAR", department: null, branch: null, position: null,
      },
      periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType,
      tenantId: T, tenantName: "P168", preview,
    });
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P168${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p168-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $1, 'P168', $1, '2025-01-06', now())`,
      [A, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 4000000, 'MONTHLY', now())`,
      [`${A}-t`, T, A],
    );
    // Jan to Oct before Sentire: ₱400,000 basic, ₱360,000 taxable, ₱20,000
    // withheld, and ₱5,000 of 13th month already paid.
    await q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "basicPayEarnedCents",
                                         "taxableCompensationCents", "withholdingTaxCents", "thirteenthMonthPaidCents",
                                         "nontaxable13MonthAndBenefitsCents", "updatedAt")
       VALUES ($1, $2, $3, 2026, 'PRIOR_PAYROLL', 40000000, 36000000, 2000000, 500000, 500000, now())`,
      [`${A}-o`, T, A],
    );
    for (const [s, e] of [["2026-11-01", "2026-11-15"], ["2026-11-16", "2026-11-30"]]) {
      const book = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [book.id]);
      regularId = book.id;
    }
    const ye = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY",
      runType: "YEAR_END", employeeIds: [A],
    });
    yearEndId = ye.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["AuditLog", "EmployeeYtdOpening", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("Y1 (T1) the 13th month run stores how the 13th month was worked out", async () => {
    const nov = await q(
      `SELECT COALESCE(SUM(s."basePayCents"),0)::text AS basic, COUNT(*)::int AS n
         FROM "PayrollSheet" s JOIN "PayrollBook" b ON b.id = s."payrollBookId"
        WHERE s."employeeId" = $1 AND b.status = 'FINALIZED' AND b."runType" = 'REGULAR'`,
      [A],
    );
    const fromRuns = BigInt(nov.rows[0].basic);
    expect(fromRuns).toBeGreaterThan(0n);
    const total = fromRuns + 40_000_000n;
    const due = total / 12n - 500_000n;

    const sheet = await sheetRow(yearEndId);
    expect(sheet.thirteenthMonthBreakdown).toEqual({
      year: 2026,
      basis: "STRICT_DOLE",
      basicFromRunsCents: fromRuns.toString(),
      runSheetCount: nov.rows[0].n,
      basicFromOpeningsCents: "40000000",
      totalBasicCents: total.toString(),
      thirteenthForYearCents: (total / 12n).toString(),
      alreadyPaidCents: "500000",
      dueCents: due.toString(),
    });
    // No adjustments on this run: the 13th month is exactly what it pays.
    expect(sheet.grossCompensationCents).toBe(due);
  });

  it("Y2 a draft 13th month payslip is a preview with the 13th month and its working", async () => {
    const sheet = await sheetRow(yearEndId);
    const p = render(sheet, "YEAR_END", true);
    expect(p.preview).toBe(true);
    const t = p.thirteenthMonth!;
    const bd = sheet.thirteenthMonthBreakdown as { dueCents: string; totalBasicCents: string };
    expect(t.pay).toBe(bd.dueCents);
    expect(BigInt(t.nonTaxable) + BigInt(t.taxableExcess)).toBe(BigInt(t.pay));
    expect(t.breakdown!.totalBasic).toBe(bd.totalBasicCents);
    expect(t.breakdown!.alreadyPaid).toBe("500000");
    expect(p.annualization).toBeUndefined();
  });

  it("Y3 once annualized, tax on the excess plus the year-end adjustment is the tax withheld", async () => {
    await runAnnualization(T, yearEndId);
    const sheet = await sheetRow(yearEndId);
    const a = render(sheet, "YEAR_END", true).annualization!;
    expect(BigInt(a.taxOnThisPay) + BigInt(a.yearEndAdjustment)).toBe(sheet.withholdingTaxCents);
    expect(BigInt(a.yearEndAdjustment)).not.toBe(0n);
    expect(a.isRefund).toBe(BigInt(a.yearEndAdjustment) < 0n);
  });

  it("Y4 a regular payslip has no 13th month section and is not a preview by default", async () => {
    const p = render(await sheetRow(regularId), "REGULAR");
    expect(p.preview).toBe(false);
    expect(p.thirteenthMonth).toBeUndefined();
    expect(p.annualization).toBeUndefined();
  });

  it("Y5 page, API and payslip wiring", () => {
    const route = readFileSync("src/app/api/payroll/runs/[id]/payslips/[employeeId]/route.ts", "utf8");
    expect(route).toContain('if (book.status !== "FINALIZED" && book.status !== "DRAFT")');
    expect(route).toContain('const preview = book.status === "DRAFT";');
    expect(route).toMatch(/tenantName,\s*preview,\s*\}\);/);

    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(page).toContain('const canPreview = run.status === "DRAFT" || run.status === "FINALIZED";');
    expect(page).toContain("onClick={canPreview ? () => setPayslipFor(s.employeeId) : undefined}");
    expect(page).toContain('{ label: "13th Month Pay", value: (s) => yearEndFigures(s).pay.toString(), strong: true }');
    expect(page).toContain('{isFinalized ? "Payslip" : "Payslip preview"}');

    const body = readFileSync("src/components/payslip/payslip-detail.tsx", "utf8");
    expect(body).toContain('data-testid="payslip-preview-banner"');
    expect(body).toContain("{!detail.preview && (");
    expect(body).toContain('<SectionTitle title="13th Month Pay" />');
  });
});
