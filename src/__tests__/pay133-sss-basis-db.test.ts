/**
 * PAY-133 end to end on a real Postgres: payroll runs are created with the
 * real persist.ts code (createDraftRun, recomputeRun, queueRun + processRun),
 * earlier runs are finalized, and the next run's SSS comes from them.
 *
 *   D1  a new company deducts on the FIRST payday by default (schema default
 *       flipped); an existing company's setting is untouched by the migration.
 *   D2  1 to 15 Oct with no September in Sentire: SSS on the contracted basic,
 *       labelled "CONTRACTED_FALLBACK".
 *   D3  1 to 15 Nov (first payday): SSS on October's actual basic.
 *         A  ₱25,000, one unpaid day in October: base ₱23,850.57.
 *         D  ₱30,000, 120 minutes late and 10 OT hours in October: base is
 *            ₱30,000 minus the late deduction; overtime is not in it.
 *         C  hired 20 Oct: base is the 20 to 31 Oct basic only.
 *         B  hired 9 Nov: no SSS; PhilHealth and Pag-IBIG still deducted.
 *       PhilHealth and Pag-IBIG are on the contracted basic for everyone.
 *   D4  recomputing the 1 to 15 Nov draft gives the same SSS.
 *   D5  16 to 30 Nov on the 16 to 30 run deducts nothing under FIRST_CUTOFF.
 *   D6  a company on SECOND_CUTOFF: 16 to 30 Nov (queued, then processed)
 *       deducts SSS on the 30th, still based on OCTOBER's basic; this run's
 *       unpaid day does not change it; the 9 Nov hire has no SSS.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun, processRun, queueRun, recomputeRun } from "@/lib/payroll/persist";
import { computePagibig, computePhilHealth, computeSSS } from "@/lib/statutory/compute";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p133t${sfx}`;
const id = (s: string) => `p133${s}${sfx}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const MIGRATION = readFileSync(
  "prisma/migrations/20261117000000_pay133_statutory_cutoff_default_first/migration.sql",
  "utf8",
);

type SheetRow = {
  employeeId: string;
  basePayCents: string;
  lateUndertimeDeductionCents: string;
  otPayCents: string;
  sssEeCents: string;
  sssErCents: string;
  sssEcCents: string;
  philhealthEeCents: string;
  pagibigEeCents: string;
  statutoryDeductedSnapshot: boolean;
  statutoryBreakdown: { sssBasis?: { kind: string; month: string; compensationCents: string } };
};

describeDb("PAY-133 SSS on actual basic, end to end (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  async function employee(key: string, hire: string, basic: number) {
    await q(
      // PAY-172: no time clock, so a run without DTR pays the full basic (what these SSS checks need).
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P133', $1, $3, false, now())`,
      [id(key), T, hire],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'MONTHLY', now())`,
      [`${id(key)}-t`, T, id(key), hire, basic],
    );
    return id(key);
  }
  async function periodInput(emp: string, start: string, end: string, v: { unpaid?: number; late?: number; ot?: number; days?: number }) {
    await q(
      `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd",
                                  "daysWorked", "unpaidLeaveDays", "lateUndertimeMinutes", "regularOtHours", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [`${emp}-${start}`, T, emp, `${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`, v.days ?? 0, v.unpaid ?? 0, v.late ?? 0, v.ot ?? 0],
    );
  }
  async function run(start: string, end: string) {
    return createDraftRun({ tenantId: T, periodStart: d(start), periodEnd: d(end), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
  }
  const finalize = (bookId: string) => q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [bookId]);
  async function sheets(bookId: string): Promise<Map<string, SheetRow>> {
    const r = await q(
      `SELECT "employeeId", "basePayCents"::text, "lateUndertimeDeductionCents"::text, "otPayCents"::text,
              "sssEeCents"::text, "sssErCents"::text, "sssEcCents"::text, "philhealthEeCents"::text,
              "pagibigEeCents"::text, "statutoryDeductedSnapshot", "statutoryBreakdown"
         FROM "PayrollSheet" WHERE "payrollBookId" = $1`,
      [bookId],
    );
    return new Map(r.rows.map((row: SheetRow) => [row.employeeId, row]));
  }

  let A = "", B = "", C = "", D = "";
  const ruleRows: [string, unknown][] = [
    ["SSS_SCHEDULE", SSS],
    ["PHILHEALTH_SCHEDULE", PHIC],
    ["PAGIBIG_SCHEDULE", PAGIBIG],
    ["BIR_WITHHOLDING_TABLE", BIR],
    ["MINIMUM_WAGE_RATE", MIN_WAGE],
    // The stored rule needs at least one item; no employee here has one.
    ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
  ];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    // No statutoryCutoffRule given: the column default decides (D1).
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P133${sfx}`.toUpperCase()]);
    for (const [cat, payload] of ruleRows) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p133-${cat}`, JSON.stringify(payload)],
      );
    }
    A = await employee("a", "2025-01-06", 2_500_000);
    B = await employee("b", "2026-11-09", 2_800_000);
    C = await employee("c", "2026-10-20", 2_000_000);
    D = await employee("d", "2025-01-06", 3_000_000);
    await periodInput(A, "2026-10-16", "2026-10-31", { unpaid: 1 });
    await periodInput(D, "2026-10-01", "2026-10-15", { late: 120 });
    await periodInput(D, "2026-10-16", "2026-10-31", { ot: 10 });
    await periodInput(C, "2026-10-16", "2026-10-31", { days: 9 });
    await periodInput(B, "2026-11-01", "2026-11-15", { days: 5 });
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [`${T}x`]);
    await admin.end();
  });

  it("D1 new companies default to the first payday; the migration leaves existing ones alone", async () => {
    expect((await q(`SELECT "statutoryCutoffRule" r FROM "Tenant" WHERE id = $1`, [T])).rows[0].r).toBe("FIRST_CUTOFF");
    await q(
      `INSERT INTO "Tenant" (id, name, "companyCode", "statutoryCutoffRule", "updatedAt") VALUES ($1, $1, $2, 'SECOND_CUTOFF', now())`,
      [`${T}x`, `P133X${sfx}`.toUpperCase()],
    );
    await q(MIGRATION); // running it again changes no row
    expect((await q(`SELECT "statutoryCutoffRule" r FROM "Tenant" WHERE id = $1`, [`${T}x`])).rows[0].r).toBe("SECOND_CUTOFF");
  });

  let oct1 = "", oct2 = "", nov1 = "";

  it("D2 1 to 15 Oct, no September in Sentire: contracted basic, labelled", async () => {
    oct1 = (await run("2026-10-01", "2026-10-15")).id;
    const s = await sheets(oct1);
    expect([...s.keys()].sort()).toEqual([A, D].sort()); // B and C not hired yet
    const a = s.get(A)!;
    expect(a.statutoryDeductedSnapshot).toBe(true);
    expect(a.statutoryBreakdown.sssBasis).toEqual({ kind: "CONTRACTED_FALLBACK", month: "2026-09", compensationCents: "2500000" });
    expect(BigInt(a.sssEeCents)).toBe(computeSSS(SSS, 2_500_000n).employee);
    await finalize(oct1);
    oct2 = (await run("2026-10-16", "2026-10-31")).id;
    const s2 = await sheets(oct2);
    expect(s2.get(A)!.statutoryDeductedSnapshot).toBe(false); // first payday only
    await finalize(oct2);
  });

  it("D3 1 to 15 Nov: SSS on October's actual basic", async () => {
    nov1 = (await run("2026-11-01", "2026-11-15")).id;
    const s = await sheets(nov1);
    const oct1s = await sheets(oct1);
    const oct2s = await sheets(oct2);
    const basic = (r: SheetRow) => BigInt(r.basePayCents) - BigInt(r.lateUndertimeDeductionCents);

    // A: ₱12,500 + (₱12,500 - one day ₱1,149.43) = ₱23,850.57
    const a = s.get(A)!;
    expect(basic(oct2s.get(A)!)).toBe(1_250_000n - 114_943n);
    expect(a.statutoryBreakdown.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" });
    expect(BigInt(a.sssEeCents)).toBe(computeSSS(SSS, 2_385_057n).employee);
    expect(BigInt(a.sssEeCents)).toBeLessThan(computeSSS(SSS, 2_500_000n).employee);
    expect(BigInt(a.philhealthEeCents)).toBe(computePhilHealth(PHIC, 2_500_000n).employee);
    expect(BigInt(a.pagibigEeCents)).toBe(computePagibig(PAGIBIG, 2_500_000n).employee);

    // D: late comes off, overtime does not go in.
    const dLate = BigInt(oct1s.get(D)!.lateUndertimeDeductionCents);
    expect(dLate).toBeGreaterThan(0n);
    expect(BigInt(oct2s.get(D)!.otPayCents)).toBeGreaterThan(0n);
    expect(s.get(D)!.statutoryBreakdown.sssBasis).toEqual({
      kind: "PREVIOUS_MONTH_ACTUAL",
      month: "2026-10",
      compensationCents: (3_000_000n - dLate).toString(),
    });

    // C: hired 20 Oct, base is the 16 to 31 Oct run's basic (9 days).
    const cOct = basic(oct2s.get(C)!);
    expect(cOct).toBeGreaterThan(0n);
    expect(cOct).toBeLessThan(1_000_000n);
    expect(s.get(C)!.statutoryBreakdown.sssBasis?.compensationCents).toBe(cOct.toString());
    expect(BigInt(s.get(C)!.sssEeCents)).toBe(computeSSS(SSS, cOct).employee);
    expect(BigInt(s.get(C)!.philhealthEeCents)).toBe(computePhilHealth(PHIC, 2_000_000n).employee);

    // B: hired 9 Nov, no SSS; PhilHealth and Pag-IBIG on the contract.
    const b = s.get(B)!;
    expect(b.statutoryDeductedSnapshot).toBe(true);
    expect([b.sssEeCents, b.sssErCents, b.sssEcCents]).toEqual(["0", "0", "0"]);
    expect(b.statutoryBreakdown.sssBasis).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10", compensationCents: "0" });
    expect(BigInt(b.philhealthEeCents)).toBe(computePhilHealth(PHIC, 2_800_000n).employee);
    expect(BigInt(b.pagibigEeCents)).toBe(computePagibig(PAGIBIG, 2_800_000n).employee);
    expect(BigInt(b.philhealthEeCents)).toBeGreaterThan(0n);
  });

  it("D4 recomputing the draft gives the same SSS", async () => {
    const before = await sheets(nov1);
    await recomputeRun(T, nov1);
    const after = await sheets(nov1);
    for (const e of [A, B, C, D]) {
      expect(after.get(e)!.sssEeCents).toBe(before.get(e)!.sssEeCents);
      expect(after.get(e)!.statutoryBreakdown.sssBasis).toEqual(before.get(e)!.statutoryBreakdown.sssBasis);
    }
  });

  it("D5 16 to 30 Nov under the first-payday rule deducts nothing", async () => {
    await finalize(nov1);
    const nov2 = (await run("2026-11-16", "2026-11-30")).id;
    const s = await sheets(nov2);
    for (const e of [A, B, C, D]) {
      expect(s.get(e)!.statutoryDeductedSnapshot).toBe(false);
      expect(s.get(e)!.sssEeCents).toBe("0");
    }
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [nov2]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [nov2]);
  });

  it("D6 second-payday company: queued 16 to 30 Nov deducts on October's basic", async () => {
    await q(`UPDATE "Tenant" SET "statutoryCutoffRule" = 'SECOND_CUTOFF' WHERE id = $1`, [T]);
    await periodInput(A, "2026-11-16", "2026-11-30", { unpaid: 1 });
    const book = await queueRun({ tenantId: T, periodStart: d("2026-11-16"), periodEnd: d("2026-11-30"), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
    await processRun(T, book.id);
    const s = await sheets(book.id);
    const basic = (r: SheetRow) => BigInt(r.basePayCents) - BigInt(r.lateUndertimeDeductionCents);

    const a = s.get(A)!;
    expect(a.statutoryDeductedSnapshot).toBe(true);
    expect(basic(a)).toBe(1_250_000n - 114_943n); // this run's unpaid day ...
    expect(a.statutoryBreakdown.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" });
    expect(BigInt(a.sssEeCents)).toBe(computeSSS(SSS, 2_385_057n).employee); // ... does not move SSS
    expect(BigInt(a.philhealthEeCents)).toBe(computePhilHealth(PHIC, 2_500_000n).employee);

    // B, hired 9 Nov: the 30 Nov deduction is based on October, when B was
    // not employed. No SSS; PhilHealth and Pag-IBIG still deducted.
    const b = s.get(B)!;
    expect(b.statutoryDeductedSnapshot).toBe(true);
    expect([b.sssEeCents, b.sssErCents, b.sssEcCents]).toEqual(["0", "0", "0"]);
    expect(b.statutoryBreakdown.sssBasis).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10", compensationCents: "0" });
    expect(BigInt(b.philhealthEeCents)).toBe(computePhilHealth(PHIC, 2_800_000n).employee);
    expect(BigInt(b.pagibigEeCents)).toBe(computePagibig(PAGIBIG, 2_800_000n).employee);
  });
});
