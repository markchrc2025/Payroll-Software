/**
 * PAY-198 (Mark, 20 Nov 2026 14:23): "lates and undertime is a deduction on
 * 13th month. But this should be optional since some employers opt not to
 * deduct these."
 *
 * Employee: monthly 30,000.00 (hourly 172.41). Finalized 16 to 31 Oct 2026:
 * basic 15,000.00, 60 minutes late = 172.41.
 *
 *   L1  (T1) default: the Year-End run pays (15,000.00 - 172.41) / 12 =
 *       1,235.63 (it paid 1,250.00), and the breakdown shows the 172.41.
 *   L2  option off: 1,250.00, nothing shown as deducted.
 *   L3  a 13th month paid in a regular run (1 to 15 Nov, 30 minutes late =
 *       86.21; this run and 3 more projected): this run's lates come off
 *       once: (14,827.59 + 60,000.00 - 86.21) / 12 = 6,228.44.
 *   L4  the setting is saved by the settings API and shown on Pay Rules.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun, finalizeRun } from "@/lib/payroll/persist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p198t${sfx}`;
const id = (s: string) => `p198${s}${sfx}`;
const E = id("emp");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-198 lates and undertime in the 13th month base (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const thirteenth = async (book: string) =>
    (await q(`SELECT "thirteenthMonthBreakdown" b FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`, [book, E])).rows[0].b as
      { dueCents: string; latesDeductedCents?: string; totalBasicCents: string };
  const yearEnd = async () => {
    const book = (await createDraftRun({ tenantId: T, periodStart: d("2026-12-01"), periodEnd: d("2026-12-31"), cycle: "SEMI_MONTHLY", runType: "YEAR_END", employeeIds: [E] })).id;
    const t = await thirteenth(book);
    await q(`DELETE FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book]);
    await q(`DELETE FROM "PayrollBook" WHERE id = $1`, [book]);
    return t;
  };
  const late = (key: string, start: string, end: string, minutes: number) =>
    q(
      `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd", "lateUndertimeMinutes", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [id(key), T, E, `${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`, minutes],
    );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P198${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p198-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P198', $1, '2025-01-06', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    await late("oct", "2026-10-16", "2026-10-31", 60);
    await late("nov", "2026-11-01", "2026-11-15", 30);
    const oct = await createDraftRun({ tenantId: T, periodStart: d("2026-10-16"), periodEnd: d("2026-10-31"), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
    expect(oct.sheets[0].lateUndertimeDeductionCents).toBe(17_241n);
    await finalizeRun(T, oct.id, null);
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("L1 (T1) by default lates and undertime reduce the 13th month base", async () => {
    expect(await yearEnd()).toMatchObject({ dueCents: "123563", totalBasicCents: "1482759", latesDeductedCents: "17241" });
  });

  it("L2 option off: they do not", async () => {
    await q(`UPDATE "Tenant" SET "thirteenthMonthDeductLates" = false WHERE id = $1`, [T]);
    const t = await yearEnd();
    expect(t).toMatchObject({ dueCents: "125000", totalBasicCents: "1500000" });
    expect(t.latesDeductedCents).toBeUndefined();
    await q(`UPDATE "Tenant" SET "thirteenthMonthDeductLates" = true WHERE id = $1`, [T]);
  });

  it("L3 in a regular run, this run's lates come off once, not for each projected period", async () => {
    const nov = await createDraftRun({ tenantId: T, periodStart: d("2026-11-01"), periodEnd: d("2026-11-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR", includeThirteenthMonth: true });
    expect(await thirteenth(nov.id)).toMatchObject({ dueCents: "622844", totalBasicCents: "7474138", latesDeductedCents: "25862" });
  });
});

describe("PAY-198 setting", () => {
  it("L4 saved by the settings API and shown on Pay Rules", () => {
    expect(readFileSync("src/app/api/settings/tenant/route.ts", "utf8")).toMatch(/thirteenthMonthDeductLates: z\.boolean\(\)\.optional\(\)/);
    expect(readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8")).toContain("Deduct lates and undertime from the 13th-month base");
  });
});
