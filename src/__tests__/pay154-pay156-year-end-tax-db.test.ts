/**
 * PAY-154 and PAY-156 end to end on a real Postgres: real runs
 * (createDraftRun), finalized November history, year-to-date openings
 * (PAY-144) and the real year-end annualization.
 *
 *   D1  (T1, PAY-154) a 13th month run taxes the excess over the 90,000 at
 *       the employee's rate for the year: the year so far (opening + finalized
 *       November) is passed in, and the tax is the extra the excess adds.
 *   D2  year-end annualization counts the 13th month run's own taxable excess
 *       and its withholding: after the true-up, the tax withheld for the year
 *       (opening + November + 13th month run) equals the tax due on the
 *       year's whole taxable pay.
 *   D3  (T1, PAY-156) a final pay refunds tax withheld above the year's tax
 *       due (negative withholding), and net pay includes the refund.
 *   D4  a final pay after the 13th month run counts that run's taxable pay
 *       and withholding in the year so far.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun } from "@/lib/payroll/persist";
import { runAnnualization, type AnnualizationDataJson } from "@/lib/payroll/annualize";
import { lookupBIR } from "@/lib/statutory/compute";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p154t${sfx}`;
const id = (s: string) => `p154${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const yearTax = (taxable: bigint) => (taxable <= 0n ? 0n : lookupBIR(BIR, "MONTHLY", taxable / 12n).tax * 12n);

describeDb("PAY-154 and PAY-156 year-end and final pay tax, end to end (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const A = id("a"); // ₱25,000; used ₱85,000 of the 90,000 before Sentire
  const B = id("b"); // ₱30,000; over-withheld before Sentire, leaves 10 Dec
  let yearEndId = "";

  async function employee(key: string, basic: number) {
    await q(
      // PAY-172: no time clock, so regular runs without DTR pay the full basic (what these checks need).
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P154', $1, '2025-01-06', false, now())`,
      [key, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', $4, 'MONTHLY', now())`,
      [`${key}-t`, T, key, basic],
    );
  }
  async function opening(emp: string, basic: number, taxable: number, wht: number, nt13: number) {
    await q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "basicPayEarnedCents",
                                         "taxableCompensationCents", "withholdingTaxCents", "nontaxable13MonthAndBenefitsCents", "updatedAt")
       VALUES ($1, $2, $3, 2026, 'PRIOR_PAYROLL', $4, $5, $6, $7, now())`,
      [`${emp}-o`, T, emp, basic, taxable, wht, nt13],
    );
  }
  /** Taxable pay and tax withheld on the employee's FINALIZED sheets of 2026. */
  async function finalized(emp: string, runTypes: string[]) {
    const r = await q(
      `SELECT COALESCE(SUM(s."grossTaxableIncomeCents"),0)::text AS taxable, COALESCE(SUM(s."withholdingTaxCents"),0)::text AS wht
         FROM "PayrollSheet" s JOIN "PayrollBook" b ON b.id = s."payrollBookId"
        WHERE s."employeeId" = $1 AND b.status = 'FINALIZED' AND b."runType" = ANY($2::"PayrollRunType"[])`,
      [emp, runTypes],
    );
    return { taxable: BigInt(r.rows[0].taxable), wht: BigInt(r.rows[0].wht) };
  }
  async function sheet(bookId: string, emp: string) {
    const r = await q(
      `SELECT "grossTaxableIncomeCents"::text AS taxable, "withholdingTaxCents"::text AS wht, "netPayCents"::text AS net,
              "grossCompensationCents"::text AS gross, "finalPayBreakdown", "annualizationData"
         FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [bookId, emp],
    );
    return r.rows[0] as {
      taxable: string; wht: string; net: string; gross: string;
      finalPayBreakdown: Record<string, string> | null; annualizationData: AnnualizationDataJson | null;
    };
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "finalPayTaxMethod", "updatedAt") VALUES ($1, $1, $2, 'ANNUALIZE', now())`, [T, `P154${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p154-${cat}`, JSON.stringify(payload)],
      );
    }
    await employee(A, 2_500_000);
    await employee(B, 3_000_000);
    // A: Jan to Oct before Sentire, ₱250,000 basic, ₱210,000 taxable, an ₱85,000 bonus.
    await opening(A, 25_000_000, 21_000_000, 1_500_000, 8_500_000);
    // B: ₱281,500 taxable with ₱10,975 withheld (more than the year's tax due).
    await opening(B, 30_000_000, 28_150_000, 1_097_500, 1_000_000);
    for (const [s, e] of [["2026-11-01", "2026-11-15"], ["2026-11-16", "2026-11-30"]]) {
      const book = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [book.id]);
    }
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeeYtdOpening", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 (T1, PAY-154) the 13th month run taxes the excess at the year's rate", async () => {
    // A only: B leaves on 10 Dec and gets a final pay instead (D3).
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY",
      runType: "YEAR_END", employeeIds: [A],
    });
    yearEndId = book.id;
    const s = await sheet(book.id, A);
    const nov = await finalized(A, ["REGULAR"]);
    const ytd = 21_000_000n + nov.taxable;
    const excess = BigInt(s.taxable);
    expect(excess).toBeGreaterThan(0n); // only ₱5,000 of the 90,000 left
    expect(lookupBIR(BIR, "MONTHLY", excess).tax).toBe(0n); // what the old way withheld
    const expected = yearTax(ytd + excess) - yearTax(ytd);
    expect(expected).toBeGreaterThan(0n);
    expect(BigInt(s.wht)).toBe(expected);
  });

  it("D2 annualization counts the 13th month run itself", async () => {
    // PAY-155: annualize while the 13th month run is a draft, then seal it.
    await runAnnualization(T, yearEndId);
    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [yearEndId]);
    const s = await sheet(yearEndId, A);
    const ann = s.annualizationData!;
    expect(ann.yearEndTaxableCents).toBe(s.taxable);
    const nov = await finalized(A, ["REGULAR"]);
    const totalTaxable = 21_000_000n + nov.taxable + BigInt(s.taxable);
    expect(BigInt(ann.ytdRegularTaxableCents)).toBe(totalTaxable);
    // Withheld for the whole year after the true-up = tax due on the whole year.
    const withheld = 1_500_000n + nov.wht + BigInt(s.wht);
    expect(withheld).toBe(yearTax(totalTaxable));
  });

  it("D3 (T1, PAY-156) final pay refunds tax withheld above the year's tax due", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY",
      runType: "FINAL_PAY", employeeIds: [B], separationReason: "RESIGNATION",
    });
    const s = await sheet(book.id, B);
    const fp = s.finalPayBreakdown!;
    const earlier = await finalized(B, ["REGULAR"]);
    expect(BigInt(fp.cyPriorTaxableIncomeCents)).toBe(28_150_000n + earlier.taxable);
    expect(BigInt(fp.cyPriorWithholdingTaxCents)).toBe(1_097_500n + earlier.wht);
    const due = yearTax(BigInt(fp.cyPriorTaxableIncomeCents) + BigInt(s.taxable));
    expect(BigInt(s.wht)).toBe(due - BigInt(fp.cyPriorWithholdingTaxCents));
    expect(BigInt(s.wht)).toBeLessThan(0n); // a refund
    expect(BigInt(s.net)).toBe(BigInt(s.gross) - BigInt(s.wht)); // no contributions on a 13th-month-only final pay
  });

  it("D4 final pay after the 13th month run counts that run in the year so far", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-16"), periodEnd: d("2026-12-31"), cycle: "SEMI_MONTHLY",
      runType: "FINAL_PAY", employeeIds: [A], separationReason: "RESIGNATION",
    });
    const s = await sheet(book.id, A);
    const fp = s.finalPayBreakdown!;
    const earlier = await finalized(A, ["REGULAR", "YEAR_END"]);
    const ye = await finalized(A, ["YEAR_END"]);
    expect(ye.taxable).toBeGreaterThan(0n);
    expect(BigInt(fp.cyPriorTaxableIncomeCents)).toBe(21_000_000n + earlier.taxable);
    expect(BigInt(fp.cyPriorWithholdingTaxCents)).toBe(1_500_000n + earlier.wht);
    const due = yearTax(BigInt(fp.cyPriorTaxableIncomeCents) + BigInt(s.taxable));
    expect(BigInt(s.wht)).toBe(due - BigInt(fp.cyPriorWithholdingTaxCents));
  });
});
