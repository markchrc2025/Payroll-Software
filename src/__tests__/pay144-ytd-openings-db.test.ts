/**
 * PAY-144 end to end on a real Postgres (Mark, 16 Nov 2026, HR.my review
 * D4 = C): year-to-date openings entered through the real API and CSV import,
 * then read by real runs (createDraftRun, recomputeRun), year-end
 * annualization and the 2316 route.
 *
 * The company starts on Sentire in November 2026. November's two regular runs
 * are finalized. Then:
 *
 *   A1  PUT and GET: an opening is saved through the API (centavos as
 *       strings) and read back; a previous employer without a name and an
 *       unknown employee are refused; every save is audited.
 *   A2  CSV import is all or nothing: one bad row and nothing is saved, with
 *       every problem listed by row; the fixed file saves; a second import of
 *       the same employee, year and source replaces it.
 *   A3  the database itself refuses a previous employer with basic pay, and a
 *       PRIOR_PAYROLL row with an employer name.
 *   D1  (T1) the 13th month (YEAR_END) of a company that joined mid-year:
 *         A  ₱30,000; Jan to Oct before Sentire ₱300,000, ₱10,000 of 13th
 *            month paid in June: (300,000 + 30,000) / 12 - 10,000 = ₱17,500.
 *         B  hired 1 Jul from Acme: this company Jul to Oct ₱80,000; Acme's
 *            pay never counts: (80,000 + 20,000) / 12 = ₱8,333.33. Acme used
 *            ₱85,000 of the 90,000 exemption, so only ₱5,000 is exempt.
 *         C  no openings: ₱24,000 / 12 = ₱2,000, no snapshot (invariant).
 *       The run keeps a copy of the openings it used.
 *   D2  recomputing the draft gives the same figures.
 *   D3  final pay (D leaves 10 Dec): the year's prior taxable pay and tax
 *       include the opening; the prorated 13th month includes its basic pay.
 *   D4  annualization adds both sources' taxable pay and tax, and records how
 *       much came from openings.
 *   A4  once the 13th month run is finalized, the openings are locked (PUT and
 *       DELETE refused, GET says locked).
 *   A5  the 2316 shows this employer's pay before Sentire in its boxes and the
 *       previous employer's taxable pay and tax.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p144t${sfx}`;
const id = (s: string) => `p144${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p144-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));
vi.mock("@/lib/jobs/workers", () => ({ enqueuePayrollRun: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.9" }));

import { writeAuditLog } from "@/lib/audit";
import { DELETE as delOpening, GET as getOpenings, PUT as putOpening } from "@/app/api/payroll/ytd-openings/route";
import { POST as importOpenings } from "@/app/api/payroll/ytd-openings/import/route";
import { GET as get2316 } from "@/app/api/payroll/reports/bir/2316/route";
import { createDraftRun, recomputeRun } from "@/lib/payroll/persist";
import { runAnnualization, type AnnualizationDataJson } from "@/lib/payroll/annualize";

const MIGRATION = readFileSync("prisma/migrations/20261119000000_pay144_ytd_openings/migration.sql", "utf8");

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://test.local${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
function csvReq(csv: string) {
  const fd = new FormData();
  fd.append("file", new File([csv], "openings.csv", { type: "text/csv" }));
  return new NextRequest("http://test.local/api/payroll/ytd-openings/import", { method: "POST", body: fd });
}
const HEADER =
  "employee_number,year,source,previous_employer_name,previous_employer_tin,basic_pay_earned,thirteenth_month_paid,taxable_compensation,tax_withheld,nontaxable_13th_month_and_benefits,sss_ee,philhealth_ee,pagibig_ee,other_nontaxable,note";

type Sheet = {
  employeeId: string;
  grossCompensationCents: string;
  grossTaxableIncomeCents: string;
  taxableAllowancesCents: string;
  nontaxable13MonthAndBenefitsCents: string;
  withholdingTaxCents: string;
  periodInputSnapshot: { ytdOpening?: Record<string, string | number | null> };
  finalPayBreakdown: Record<string, string> | null;
  annualizationData: AnnualizationDataJson | null;
};

describeDb("PAY-144 year-to-date openings, end to end (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const A = id("a"), B = id("b"), C = id("c"), D = id("dd");
  let yearEndId = "";

  async function employee(key: string, hire: string, basic: number, lastDay?: string) {
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "lastWorkingDate", "updatedAt")
       VALUES ($1, $2, $1, 'P144', $1, $3, $4, now())`,
      [key, T, hire, lastDay ?? null],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'MONTHLY', now())`,
      [`${key}-t`, T, key, hire, basic],
    );
  }
  async function sheets(bookId: string): Promise<Map<string, Sheet>> {
    const r = await q(
      `SELECT "employeeId", "grossCompensationCents"::text, "grossTaxableIncomeCents"::text, "taxableAllowancesCents"::text,
              "nontaxable13MonthAndBenefitsCents"::text, "withholdingTaxCents"::text, "periodInputSnapshot",
              "finalPayBreakdown", "annualizationData"
         FROM "PayrollSheet" WHERE "payrollBookId" = $1`,
      [bookId],
    );
    return new Map(r.rows.map((row: Sheet) => [row.employeeId, row]));
  }
  /** Sum of a column over the employee's FINALIZED November sheets. */
  async function novSum(emp: string, col: "grossTaxableIncomeCents" | "withholdingTaxCents" | "basePayCents"): Promise<bigint> {
    const r = await q(
      `SELECT COALESCE(SUM(s."${col}"), 0)::text AS v FROM "PayrollSheet" s JOIN "PayrollBook" b ON b.id = s."payrollBookId"
        WHERE s."employeeId" = $1 AND b.status = 'FINALIZED' AND b."runType" = 'REGULAR'`,
      [emp],
    );
    return BigInt(r.rows[0].v);
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P144${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p144-${cat}`, JSON.stringify(payload)],
      );
    }
    await employee(A, "2024-01-08", 3_000_000);
    await employee(B, "2026-07-01", 2_000_000);
    await employee(C, "2025-01-06", 2_400_000);
    await employee(D, "2025-01-06", 3_600_000, "2026-12-10");
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeeYtdOpening", "PeriodInput", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("the migration re-applies cleanly (IF NOT EXISTS everywhere)", async () => {
    await q(MIGRATION);
  });

  it("A1 PUT and GET", async () => {
    vi.mocked(writeAuditLog).mockClear();
    const res = await putOpening(json("/api/payroll/ytd-openings", "PUT", {
      employeeId: A,
      year: 2026,
      source: "PRIOR_PAYROLL",
      basicPayEarnedCents: "30000000", // ₱300,000 Jan to Oct
      thirteenthMonthPaidCents: "1000000", // ₱10,000 paid in June
      taxableCompensationCents: "25000000",
      withholdingTaxCents: "2000000",
      nontaxable13MonthAndBenefitsCents: "1000000",
      sssEeCents: "900000",
      philhealthEeCents: "750000",
      pagibigEeCents: "200000",
    }));
    expect(res.status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entity: "EmployeeYtdOpening" }));

    const list = await (await getOpenings(json("/api/payroll/ytd-openings?year=2026", "GET"))).json();
    const a = list.data.employees.find((e: { employeeId: string }) => e.employeeId === A);
    expect(a.locked).toBe(false);
    expect(a.priorPayroll).toMatchObject({ basicPayEarnedCents: "30000000", thirteenthMonthPaidCents: "1000000", withholdingTaxCents: "2000000" });
    expect(a.previousEmployer).toBeNull();
    expect(list.data.employees.map((e: { employeeId: string }) => e.employeeId).sort()).toEqual([A, B, C, D].sort());

    const noName = await putOpening(json("/api/payroll/ytd-openings", "PUT", { employeeId: B, year: 2026, source: "PREVIOUS_EMPLOYER" }));
    expect(noName.status).toBe(422);
    const nobody = await putOpening(json("/api/payroll/ytd-openings", "PUT", { employeeId: "nobody", year: 2026, source: "PRIOR_PAYROLL" }));
    expect(nobody.status).toBe(404);
  });

  it("A2 CSV import is all or nothing", async () => {
    const bad = [
      HEADER,
      `${B},2026,PRIOR_PAYROLL,,,"80,000.00",,75000,3000,,,,,,`,
      `${B},2026,PREVIOUS_EMPLOYER,Acme Corp.,123-456-789-000,,,100000,5000,85000,,,,,`,
      `NOPE-1,2026,PRIOR_PAYROLL,,,1000,,,,,,,,,`,
      `${D},2026,PRIOR_PAYROLL,,,360000,,300000,-40000,,,,,,`,
    ].join("\n");
    const r1 = await importOpenings(csvReq(bad));
    expect(r1.status).toBe(422);
    const b1 = await r1.json();
    expect(b1.details.problems.map((p: { row: number }) => p.row)).toEqual([4, 5]);
    expect(b1.details.problems[0].errors.join(" ")).toMatch(/No employee with number NOPE-1/);
    expect(b1.details.problems[1].errors.join(" ")).toMatch(/tax_withheld/);
    const none = await q(`SELECT count(*)::int AS n FROM "EmployeeYtdOpening" WHERE "tenantId" = $1 AND "employeeId" IN ($2, $3)`, [T, B, D]);
    expect(none.rows[0].n).toBe(0); // nothing saved

    const good = [
      HEADER,
      `${B},2026,PRIOR_PAYROLL,,,"79,000.00",,75000,3000,,,,,,`,
      `${B},2026,previous employer,Acme Corp.,123-456-789-000,,,100000,5000,85000,,,,,from Acme's 2316`,
      `${D},2026,PRIOR_PAYROLL,,,360000,,300000,40000,,,,,,`,
    ].join("\n");
    const r2 = await importOpenings(csvReq(good));
    expect(r2.status).toBe(200);
    expect((await r2.json()).data).toEqual({ created: 3, replaced: 0 });

    // Fix B's basic pay (79,000 was a typo): the same employee, year and source replaces.
    const r3 = await importOpenings(csvReq([HEADER, `${B},2026,PRIOR_PAYROLL,,,80000,,75000,3000,,,,,,`].join("\n")));
    expect((await r3.json()).data).toEqual({ created: 0, replaced: 1 });
    const row = await q(`SELECT "basicPayEarnedCents"::text AS v FROM "EmployeeYtdOpening" WHERE "employeeId" = $1 AND source = 'PRIOR_PAYROLL'`, [B]);
    expect(row.rows[0].v).toBe("8000000");
  });

  it("A3 the database refuses rows of the wrong shape", async () => {
    await expect(q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "previousEmployerName", "basicPayEarnedCents", "updatedAt")
       VALUES ($1, $2, $3, 2025, 'PREVIOUS_EMPLOYER', 'Acme', 100, now())`,
      [id("x1"), T, C],
    )).rejects.toThrow(/EmployeeYtdOpening_source_shape/);
    await expect(q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "previousEmployerName", "updatedAt")
       VALUES ($1, $2, $3, 2025, 'PREVIOUS_EMPLOYER', NULL, now())`,
      [id("x2"), T, C],
    )).rejects.toThrow(/EmployeeYtdOpening_source_shape/);
    await expect(q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "previousEmployerName", "updatedAt")
       VALUES ($1, $2, $3, 2025, 'PRIOR_PAYROLL', 'Acme', now())`,
      [id("x3"), T, C],
    )).rejects.toThrow(/EmployeeYtdOpening_source_shape/);
  });

  it("November's regular runs (first on Sentire) are finalized", async () => {
    for (const [s, e] of [["2026-11-01", "2026-11-15"], ["2026-11-16", "2026-11-30"]]) {
      const book = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [book.id]);
    }
    expect(await novSum(A, "basePayCents")).toBe(3_000_000n); // ₱30,000 in November
    expect(await novSum(B, "basePayCents")).toBe(2_000_000n);
    expect(await novSum(C, "basePayCents")).toBe(2_400_000n);
  });

  it("D1 (T1) the 13th month of a company that joined mid-year", async () => {
    const book = await createDraftRun({ tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "YEAR_END" });
    yearEndId = book.id;
    const s = await sheets(book.id);

    // A: (300,000 + 30,000) / 12 - 10,000 = 17,500.
    expect(s.get(A)!.grossCompensationCents).toBe("1750000");
    expect(s.get(A)!.nontaxable13MonthAndBenefitsCents).toBe("1750000"); // 10,000 used, 80,000 left
    expect(s.get(A)!.periodInputSnapshot.ytdOpening).toEqual({
      year: 2026,
      basicPayEarnedCents: "30000000",
      thirteenthMonthPaidCents: "1000000",
      taxableCompensationCents: "25000000",
      withholdingTaxCents: "2000000",
      benefitsExemptUsedCents: "1000000",
      previousEmployerName: null,
    });

    // B: (80,000 + 20,000) / 12 = 8,333.33 (floor); Acme's pay is not in it.
    expect(s.get(B)!.grossCompensationCents).toBe("833333");
    // Acme used 85,000 of the 90,000: 5,000 exempt, 3,333.33 taxable.
    expect(s.get(B)!.nontaxable13MonthAndBenefitsCents).toBe("500000");
    expect(s.get(B)!.taxableAllowancesCents).toBe("333333");
    expect(s.get(B)!.periodInputSnapshot.ytdOpening).toMatchObject({
      basicPayEarnedCents: "8000000",
      taxableCompensationCents: "17500000", // 75,000 + 100,000
      withholdingTaxCents: "800000", // 3,000 + 5,000
      benefitsExemptUsedCents: "8500000",
      previousEmployerName: "Acme Corp.",
    });

    // C: no openings, exactly as before PAY-144.
    expect(s.get(C)!.grossCompensationCents).toBe("200000"); // 24,000 / 12
    expect(s.get(C)!.nontaxable13MonthAndBenefitsCents).toBe("200000");
    expect(s.get(C)!.periodInputSnapshot.ytdOpening).toBeUndefined();
  });

  it("D2 recomputing the draft gives the same figures", async () => {
    await recomputeRun(T, yearEndId);
    const s = await sheets(yearEndId);
    expect(s.get(A)!.grossCompensationCents).toBe("1750000");
    expect(s.get(B)!.nontaxable13MonthAndBenefitsCents).toBe("500000");
    expect(s.get(C)!.grossCompensationCents).toBe("200000");
  });

  it("D3 final pay reads the openings", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY",
      runType: "FINAL_PAY", employeeIds: [D], separationReason: "RESIGNATION",
    });
    const fp = (await sheets(book.id)).get(D)!.finalPayBreakdown!;
    expect(BigInt(fp.cyPriorTaxableIncomeCents)).toBe(30_000_000n + (await novSum(D, "grossTaxableIncomeCents")));
    expect(BigInt(fp.cyPriorWithholdingTaxCents)).toBe(4_000_000n + (await novSum(D, "withholdingTaxCents")));
    // (360,000 + 36,000) / 12 = 33,000
    expect(fp.proratedThirteenthMonthCents).toBe("3300000");
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book.id]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [book.id]);
  });

  it("D4 annualization adds both sources", async () => {
    // PAY-155: annualize while the 13th month run is a draft, then seal it.
    await runAnnualization(T, yearEndId);
    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [yearEndId]);
    const s = await sheets(yearEndId);
    const a = s.get(A)!.annualizationData!;
    expect(a.ytdOpeningTaxableCents).toBe("25000000");
    expect(a.ytdOpeningWhtCents).toBe("2000000");
    expect(BigInt(a.ytdRegularTaxableCents)).toBe(25_000_000n + (await novSum(A, "grossTaxableIncomeCents")));
    expect(BigInt(a.ytdRegularWhtCents)).toBe(2_000_000n + (await novSum(A, "withholdingTaxCents")));
    const b = s.get(B)!.annualizationData!;
    expect(b.ytdOpeningTaxableCents).toBe("17500000"); // this company 75,000 + Acme 100,000
    expect(b.ytdOpeningWhtCents).toBe("800000");
    // PAY-154 (16 Nov 2026): the year also includes this 13th month run's own
    // taxable excess (B: ₱3,333.33 above the 5,000 left of the 90,000). Before
    // PAY-154 annualization left it out, which is the bug PAY-154 fixed.
    expect(b.yearEndTaxableCents).toBe("333333");
    expect(BigInt(b.ytdRegularTaxableCents)).toBe(17_500_000n + (await novSum(B, "grossTaxableIncomeCents")) + 333_333n);
    const c = s.get(C)!.annualizationData!;
    expect(c.ytdOpeningTaxableCents).toBe("0");
    expect(BigInt(c.ytdRegularTaxableCents)).toBe(await novSum(C, "grossTaxableIncomeCents"));
  });

  it("A4 openings are locked once the 13th month run is finalized", async () => {
    const put = await putOpening(json("/api/payroll/ytd-openings", "PUT", { employeeId: A, year: 2026, source: "PRIOR_PAYROLL", basicPayEarnedCents: "1" }));
    expect(put.status).toBe(409);
    const del = await delOpening(json(`/api/payroll/ytd-openings?employeeId=${A}&year=2026&source=PRIOR_PAYROLL`, "DELETE"));
    expect(del.status).toBe(409);
    const imp = await importOpenings(csvReq([HEADER, `${A},2026,PRIOR_PAYROLL,,,1,,,,,,,,,`].join("\n")));
    expect(imp.status).toBe(422);
    expect((await imp.json()).details.problems[0].errors.join(" ")).toMatch(/Locked/);
    const list = await (await getOpenings(json("/api/payroll/ytd-openings?year=2026", "GET"))).json();
    expect(list.data.employees.find((e: { employeeId: string }) => e.employeeId === A).locked).toBe(true);
    const still = await q(`SELECT "basicPayEarnedCents"::text AS v FROM "EmployeeYtdOpening" WHERE "employeeId" = $1`, [A]);
    expect(still.rows[0].v).toBe("30000000");
    // A year with no finalized 13th month run is still open.
    const other = await putOpening(json("/api/payroll/ytd-openings", "PUT", { employeeId: A, year: 2025, source: "PRIOR_PAYROLL", basicPayEarnedCents: "100" }));
    expect(other.status).toBe(200);
    const gone = await delOpening(json(`/api/payroll/ytd-openings?employeeId=${A}&year=2025&source=PRIOR_PAYROLL`, "DELETE"));
    expect(gone.status).toBe(200);
  });

  it("A5 the 2316 shows pay before Sentire and the previous employer", async () => {
    const res = await get2316(json(`/api/payroll/reports/bir/2316?year=2026&employeeId=${B}`, "GET"));
    expect(res.status).toBe(200);
    const cert = (await res.json()).data;
    const sentireTaxable = (await q(
      `SELECT COALESCE(SUM(s."grossTaxableIncomeCents"),0)::text AS v FROM "PayrollSheet" s JOIN "PayrollBook" b ON b.id = s."payrollBookId"
        WHERE s."employeeId" = $1 AND b.status = 'FINALIZED'`,
      [B],
    )).rows[0].v;
    expect(cert.includesPriorPayrollOpening).toBe(true);
    expect(BigInt(cert.totalGrossTaxableIncomeCents)).toBe(BigInt(sentireTaxable) + 7_500_000n); // + this company's 75,000
    expect(cert.previousEmployer).toEqual({ name: "Acme Corp.", tin: "123-456-789-000", taxableCompensationCents: "10000000", withholdingTaxCents: "500000" });
    expect(BigInt(cert.totalGrossTaxableAllEmployersCents)).toBe(BigInt(cert.totalGrossTaxableIncomeCents) + 10_000_000n);
  });
});
