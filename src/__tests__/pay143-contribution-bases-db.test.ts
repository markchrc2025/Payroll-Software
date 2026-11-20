/**
 * PAY-143 (Mark, 16 Nov 2026 15:05, HR.my review D1 and D2): contributions
 * stay on basic pay by default. A company may, per contribution, include other
 * earnings: the earnings ticked for that base in Pay Components, and
 * attendance premiums. The per-component ticks were read by no computation.
 *
 * Employee: monthly 20,000.00, semi-monthly. Rice 1,000.00 a payroll, ticked
 * for all three bases. October (the base month of the 1 to 15 Nov run) is
 * finalized: basic 20,000.00, rice 2,000.00, overtime 1,149.40 (8 h on
 * 16 to 31 Oct: 20,000 x 12 / 261 = 919.54 a day, 114.94 an hour, x 1.25).
 * Test tables: SSS 5% of the MSC (500 steps), PhilHealth 2.5%, Pag-IBIG 2% of
 * at most 10,000.
 *
 *   C1  options off (default): SSS 1,000.00 on 20,000; PhilHealth 500.00;
 *       Pag-IBIG 200.00. The ticks alone change nothing.
 *   C2  (T1) SSS and PhilHealth "ticked earnings" on: SSS on 22,000 = 1,100.00;
 *       PhilHealth on 22,000 = 550.00; the sheet records what was added.
 *   C3  SSS "attendance premiums" on as well: 23,149.40 falls in the 23,000
 *       MSC: 1,150.00. PhilHealth unchanged (its premiums option is off).
 *   C4  Pag-IBIG options on: still 200.00, the fund salary is capped at 10,000.
 *   C5  the settings API saves the options; Pay Rules shows them.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDraftRun, finalizeRun, recomputeRun } from "@/lib/payroll/persist";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p143t${sfx}`;
const id = (s: string) => `p143${s}${sfx}`;
const E = id("emp");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-143 contribution base options (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let nov = "";
  const set = (cols: Record<string, boolean>) =>
    q(`UPDATE "Tenant" SET ${Object.keys(cols).map((c, i) => `"${c}" = $${i + 2}`).join(", ")} WHERE id = $1`, [T, ...Object.values(cols)]);
  const contributions = async () => {
    await recomputeRun(T, nov);
    return (await q(
      `SELECT "sssEeCents"::text sss, "philhealthEeCents"::text phic, "pagibigEeCents"::text hdmf, "statutoryBreakdown" -> 'otherEarningsInBases' extra
         FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [nov, E],
    )).rows[0] as { sss: string; phic: string; hdmf: string; extra: Record<string, string> | null };
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P143${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p143-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P143', $1, '2025-01-06', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 2000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    await q(
      `INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "includeInSssBase", "includeInPhilHealthBase", "includeInPagibigBase", "updatedAt")
       VALUES ($1, $2, 'RICE', 'Rice', 'ALLOWANCE', 'TAXABLE', true, true, true, now())`,
      [id("rice"), T],
    );
    await q(
      `INSERT INTO "EmployeePayComponent" (id, "tenantId", "employeeId", "payComponentId", "amountCents", "effectiveFrom", "updatedAt")
       VALUES ($1, $2, $3, $4, 100000, '2026-10-01', now())`,
      [id("rice-a"), T, E, id("rice")],
    );
    await q(
      `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd", "regularOtHours", "updatedAt")
       VALUES ($1, $2, $3, '2026-10-16T00:00:00.000Z', '2026-10-31T00:00:00.000Z', 8, now())`,
      [id("pi"), T, E],
    );
    for (const [s, e] of [["2026-10-01", "2026-10-15"], ["2026-10-16", "2026-10-31"]]) {
      const b = await createDraftRun({ tenantId: T, periodStart: d(s), periodEnd: d(e), cycle: "SEMI_MONTHLY", runType: "REGULAR" });
      await finalizeRun(T, b.id, null);
    }
    const ot = (await q(`SELECT sum("otPayCents")::text v FROM "PayrollSheet" WHERE "tenantId" = $1`, [T])).rows[0].v;
    expect(ot).toBe("114940");
    nov = (await createDraftRun({ tenantId: T, periodStart: d("2026-11-01"), periodEnd: d("2026-11-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR" })).id;
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "EmployeePayComponent", "PayComponent", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("C1 options off: basic pay only; the ticks alone change nothing", async () => {
    expect(await contributions()).toEqual({ sss: "100000", phic: "50000", hdmf: "20000", extra: null });
  });

  it("C2 (T1) ticked earnings on for SSS and PhilHealth", async () => {
    await set({ sssIncludeEarnings: true, philhealthIncludeEarnings: true });
    expect(await contributions()).toEqual({
      sss: "110000", phic: "55000", hdmf: "20000",
      extra: { sssCents: "200000", philHealthCents: "200000", pagibigCents: "0" },
    });
  });

  it("C3 attendance premiums on for SSS as well", async () => {
    await set({ sssIncludePremiums: true });
    const c = await contributions();
    expect(c.sss).toBe("115000");
    expect(c.phic).toBe("55000");
    expect(c.extra?.sssCents).toBe("314940");
  });

  it("C4 Pag-IBIG options on: still capped at the 10,000 fund salary", async () => {
    await set({ pagibigIncludeEarnings: true, pagibigIncludePremiums: true });
    expect((await contributions()).hdmf).toBe("20000");
  });
});

describe("PAY-143 settings", () => {
  it("C5 the settings API takes the options and Pay Rules shows them", () => {
    const api = readFileSync("src/app/api/settings/tenant/route.ts", "utf8");
    for (const k of ["sssIncludeEarnings", "sssIncludePremiums", "philhealthIncludeEarnings", "philhealthIncludePremiums", "pagibigIncludeEarnings", "pagibigIncludePremiums"])
      expect(api).toMatch(new RegExp(`${k}: z\\.boolean\\(\\)\\.optional\\(\\)`));
    const page = readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8");
    expect(page).toContain("Contribution Bases");
    expect(page).toContain("Attendance premiums");
  });
});
