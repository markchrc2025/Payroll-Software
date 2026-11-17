/**
 * PAY-155: year-end annualization never changes a finalized run (Mark,
 * 17 Nov 2026 Q1b: a sealed record is never edited). The 13th month run is
 * annualized while it is a draft, then finalized.
 *
 *   T1  annualizing a FINALIZED 13th month run is refused, and its sheet
 *       (tax, net pay, annualization) is left exactly as it was.
 *   T2  annualizing the DRAFT writes the true-up; finalizing seals it as is.
 *   T3  if the year's figures change after the true-up (another run of the
 *       year is finalized), finalizing is refused until it is annualized
 *       again; then it finalizes with the current true-up.
 *   T4  the API answers 409 on a finalized run, and the run page offers
 *       Annualize only on a draft.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun, finalizeRun, PayrollRunConflictError } from "@/lib/payroll/persist";
import * as annualize from "@/lib/payroll/annualize";
import { runAnnualization, type AnnualizationDataJson } from "@/lib/payroll/annualize";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p155t${sfx}`;
const id = (s: string) => `p155${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-155 annualize before sealing (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const A = id("a");

  async function sheet(bookId: string) {
    const r = await q(
      `SELECT "withholdingTaxCents"::text AS wht, "netPayCents"::text AS net, "annualizationData"
         FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [bookId, A],
    );
    return r.rows[0] as { wht: string; net: string; annualizationData: AnnualizationDataJson | null };
  }
  async function status(bookId: string) {
    return (await q(`SELECT status FROM "PayrollBook" WHERE id = $1`, [bookId])).rows[0].status as string;
  }
  async function yearEnd(start: string, end: string) {
    return createDraftRun({
      tenantId: T, periodStart: d(start), periodEnd: d(end), cycle: "SEMI_MONTHLY",
      runType: "YEAR_END", employeeIds: [A],
    });
  }
  async function dropBook(bookId: string) {
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [bookId]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [bookId]);
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P155${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p155-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $1, 'P155', $1, '2025-01-06', now())`,
      [A, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 4000000, 'MONTHLY', now())`,
      [`${A}-t`, T, A],
    );
    // Jan to Oct before Sentire: ₱360,000 taxable with ₱20,000 withheld, so
    // the year-end true-up is not zero.
    await q(
      `INSERT INTO "EmployeeYtdOpening" (id, "tenantId", "employeeId", year, source, "basicPayEarnedCents",
                                         "taxableCompensationCents", "withholdingTaxCents", "nontaxable13MonthAndBenefitsCents", "updatedAt")
       VALUES ($1, $2, $3, 2026, 'PRIOR_PAYROLL', 40000000, 36000000, 2000000, 0, now())`,
      [`${A}-o`, T, A],
    );
    for (const [s, e] of [["2026-11-01", "2026-11-15"], ["2026-11-16", "2026-11-30"]]) {
      const book = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [book.id]);
    }
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

  it("T1 a finalized 13th month run is never changed by annualization", async () => {
    const book = await yearEnd("2026-12-01", "2026-12-15");
    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [book.id]);
    const before = await sheet(book.id);
    expect(before.annualizationData).toBeNull();

    await expect(runAnnualization(T, book.id)).rejects.toThrow(/finalized run is never changed/);

    const after = await sheet(book.id);
    expect(after).toEqual(before);
    await dropBook(book.id);
  });

  it("T2 annualize the draft, then finalize seals that true-up", async () => {
    const book = await yearEnd("2026-12-01", "2026-12-15");
    const engine = await sheet(book.id);
    const summary = await runAnnualization(T, book.id);
    expect(summary.employeeCount).toBe(1);

    const ann = await sheet(book.id);
    const trueUp = BigInt(ann.annualizationData!.trueUpCents);
    expect(trueUp).not.toBe(0n); // the opening makes a real true-up
    expect(BigInt(ann.wht)).toBe(BigInt(engine.wht) + trueUp);
    expect(BigInt(ann.net)).toBe(BigInt(engine.net) - trueUp);
    expect(await status(book.id)).toBe("DRAFT");

    await finalizeRun(T, book.id, null);
    expect(await status(book.id)).toBe("FINALIZED");
    expect(await sheet(book.id)).toEqual(ann);

    // And once sealed it stays as it is.
    await expect(runAnnualization(T, book.id)).rejects.toThrow(/finalized run is never changed/);
    expect(await sheet(book.id)).toEqual(ann);
    await dropBook(book.id);
  });

  it("T3 a stale true-up cannot be sealed; annualizing again fixes it", async () => {
    const book = await yearEnd("2026-12-16", "2026-12-31");
    await runAnnualization(T, book.id);
    const first = await sheet(book.id);

    // Another run of the year is finalized after the true-up was worked out.
    const dec = await createDraftRun({
      tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR",
    });
    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [dec.id]);

    const refused = finalizeRun(T, book.id, null);
    await expect(refused).rejects.toBeInstanceOf(PayrollRunConflictError);
    await expect(finalizeRun(T, book.id, null)).rejects.toThrow(/Annualize again, then finalize/);
    expect(await status(book.id)).toBe("DRAFT");
    expect(await sheet(book.id)).toEqual(first);

    await runAnnualization(T, book.id);
    const second = await sheet(book.id);
    expect(BigInt(second.annualizationData!.ytdRegularTaxableCents))
      .toBeGreaterThan(BigInt(first.annualizationData!.ytdRegularTaxableCents));
    await finalizeRun(T, book.id, null);
    expect(await status(book.id)).toBe("FINALIZED");
    expect(await sheet(book.id)).toEqual(second);
    await dropBook(book.id);
    await dropBook(dec.id);
  });

  it("T4 the API answers 409 on a finalized run; the page offers Annualize only on a draft", () => {
    expect(annualize.AnnualizationSealedError).toBeDefined();
    const route = readFileSync("src/app/api/payroll/runs/[id]/annualize/route.ts", "utf8");
    expect(route).toMatch(/AnnualizationSealedError\)\s*return err\(e\.message, 409\)/);
    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    const draftBlock = page.slice(page.indexOf("{isDraft && ("), page.indexOf("{isFinalized && ("));
    const finalBlock = page.slice(page.indexOf("{isFinalized && ("));
    expect(draftBlock).toContain('handleAction("annualize")');
    expect(finalBlock).not.toContain('handleAction("annualize")');
  });
});
