/**
 * PAY-171 part 2 (Mark, 17 Nov 2026 22:03): the 13th month is part of the
 * ordinary payroll cycle. If payday is 15 December, it is on that payslip,
 * not on a separate payslip or run.
 *
 *   Y1  (T1) a regular run with "Include 13th month" pays 1/12 of the year's
 *       basic (finalized runs plus this run's basic for this and the last
 *       period) on its payslip, tax-free within the ₱90,000.
 *   Y2  once that run is finalized, a Year-End run pays only what is still
 *       due (nothing when the basic came out as projected).
 *   Y3  only a regular run can include the 13th month.
 *   Y4  the payslip lists the 13th month and each bonus and one-off pay by
 *       name; one-off pay is not also in "Taxable allowances".
 *   Y5  the New Run dialog has the tick box.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p171bt${sfx}`;
const id = (s: string) => `p171b${s}${sfx}`;

import { createDraftRun } from "@/lib/payroll/persist";
import { createPayrollRunSchema } from "@/lib/validations/payroll-run";
import { buildPayslipPdfData } from "@/lib/payslip/pdf-data";

describeDb("PAY-171 13th month on a regular run (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const E = id("emp");
  let decId = "";

  const priorSheet = async (book: string, base: number) =>
    q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "grossTaxableIncomeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 5000000, 261, false,
         $5, $5, $5, $5, '[]', '[]', '{}', '{}', now())`,
      [`${book}-s`, T, book, E, base],
    );
  const finalizedBook = async (key: string, start: string, end: string) => {
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', now())`,
      [id(key), T, start, end],
    );
    return id(key);
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-10T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P171B${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p171b-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P171B', $1, '2025-01-06', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 5000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    // January to November: ₱550,000 basic on finalized runs.
    await priorSheet(await finalizedBook("jan_nov", "2026-01-01", "2026-11-30"), 55_000_000);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmploymentTerm", "Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("Y1 (T1) the 1 to 15 December run pays the 13th month on its payslip", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-12-01T00:00:00Z"), periodEnd: new Date("2026-12-15T00:00:00Z"),
      cycle: "SEMI_MONTHLY", includeThirteenthMonth: true,
    });
    decId = book.id;
    const s = (await q(
      `SELECT "basePayCents"::text b, "grossCompensationCents"::text g, "nontaxable13MonthAndBenefitsCents"::text n, "thirteenthMonthBreakdown" t
       FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [decId, E],
    )).rows[0];
    // (550,000 + 25,000 x 2) / 12 = 50,000.
    expect(s.t).toMatchObject({ dueCents: "5000000", basicProjectedCents: "5000000", periodsProjected: 2 });
    expect(s.n).toBe("5000000");
    expect(BigInt(s.g)).toBe(BigInt(s.b) + 5_000_000n);
    expect((await q(`SELECT "includeThirteenthMonth" i FROM "PayrollBook" WHERE id = $1`, [decId])).rows[0].i).toBe(true);
  });

  it("Y2 after it is finalized, the Year-End run pays only what is still due", async () => {
    await q(`UPDATE "PayrollBook" SET status = 'FINALIZED' WHERE id = $1`, [decId]);
    await priorSheet(await finalizedBook("dec2", "2026-12-16", "2026-12-31"), 2_500_000);
    const ye = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-12-01T00:00:00Z"), periodEnd: new Date("2026-12-31T00:00:00Z"),
      cycle: "MONTHLY", runType: "YEAR_END",
    });
    const t = (await q(`SELECT "thirteenthMonthBreakdown" t FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [ye.id])).rows[0]?.t;
    expect(t).toMatchObject({ alreadyPaidCents: "5000000", dueCents: "0" });
  });

  it("Y3 only a regular run can include the 13th month", () => {
    const bad = createPayrollRunSchema.safeParse({
      periodStart: "2026-12-01", periodEnd: "2026-12-31", cycle: "MONTHLY", runType: "YEAR_END", includeThirteenthMonth: true,
    });
    expect(bad.success).toBe(false);
  });

  it("Y4 the payslip lists the 13th month and each bonus and one-off pay by name", () => {
    const zero = 0n;
    const data = buildPayslipPdfData({
      company: { name: "Co", tradeName: null, address: null, city: null, province: null, zipCode: null },
      book: { periodStart: new Date("2026-12-01"), periodEnd: new Date("2026-12-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR", finalizedAt: null },
      sheet: {
        id: "s", salaryTypeSnapshot: "MONTHLY", basicSalaryCentsSnapshot: 5_000_000n, workingDaysDenominatorSnapshot: 261,
        taxClassificationSnapshot: "REGULAR", statutoryDeductedSnapshot: false, basePayCents: 2_500_000n, lateUndertimeDeductionCents: zero,
        otPayCents: zero, nsdPayCents: zero, holidayPayCents: zero, restDayPayCents: zero, hazardPayCents: zero,
        taxableAllowancesCents: 100_000n + 540_690n, nontaxable13MonthAndBenefitsCents: 5_186_667n,
        grossCompensationCents: 2_500_000n + 100_000n + 540_690n + 5_000_000n + 186_667n,
        grossTaxableIncomeCents: zero, sssEeCents: zero, sssErCents: zero, sssEcCents: zero, philhealthEeCents: zero,
        philhealthErCents: zero, pagibigEeCents: zero, pagibigErCents: zero, withholdingTaxCents: zero, nontaxableAdditionsCents: zero,
        loanDeductionsCents: zero, adjustmentDeductionsCents: zero, netPayCents: zero, periodInputSnapshot: {}, statutoryBreakdown: null,
        loanPaymentsApplied: [], adjustmentsApplied: [], expenseClaimsApplied: [],
        payComponentsApplied: [
          { name: "14th month pay", amountCents: "186667", isBonus: true },
          { name: "Sick leave conversion", amountCents: "540690", isOneOff: true },
          { name: "Transport allowance", amountCents: "100000" },
        ],
        thirteenthMonthBreakdown: { dueCents: "5000000" },
      },
      employee: { employeeNumber: "E1", firstName: "A", lastName: "B", position: null, department: null, branch: null, statutoryIds: [] },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0,
        leaveBalances: [],
      },
    });
    const lines = Object.fromEntries(data.earnings.map((l) => [l.label, l.amount]));
    expect(lines["13th month pay"]).toBe(5_000_000n);
    expect(lines["14th month pay"]).toBe(186_667n);
    expect(lines["Sick leave conversion"]).toBe(540_690n);
    expect(lines["Taxable allowances and additions"]).toBe(100_000n);
    expect(data.earnings.reduce((t, l) => t + l.amount, 0n)).toBe(2_500_000n + 100_000n + 540_690n + 5_000_000n + 186_667n);
  });

  it("Y5 the New Run dialog has the tick box", () => {
    const page = readFileSync("src/app/(dashboard)/payroll/page.tsx", "utf8");
    expect(page).toMatch(/id="pr-13th"/);
    expect(page).toMatch(/includeThirteenthMonth: form\.includeThirteenthMonth/);
  });
});
