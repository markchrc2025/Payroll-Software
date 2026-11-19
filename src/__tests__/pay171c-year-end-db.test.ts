/**
 * PAY-171 part 3. Mark's Smart payslips (Project doc of 17 Nov 2026):
 * finding 5 (cumulative average method) and finding 6 (year-end adjustment on
 * the last regular payroll as its own line). Figures use the TRAIN table of
 * 2018 to 2022 with its annual table.
 *
 *   C1  (T1) Canlubo, 1 to 15 May 2018: basic ₱9,055.00 is below the
 *       ₱10,417 taxable level, other pay lifts the period to ₱10,600.00, and
 *       the year's average (₱93,313.28 over 9 periods, ₱10,368.14) is below
 *       the level: nothing is withheld (the table alone would take ₱36.60).
 *   C2  once used, the method is kept for the rest of the year.
 *   C3  a basic above the level is taxed by the table, as before.
 *   C4  the year's last regular run (16 to 31 Dec 2021) carries the year-end
 *       adjustment: year's taxable ₱370,451.14, tax ₱24,090.23, withheld
 *       ₱24,088.63, adjustment ₱1.60 (Canlubo, finding 6).
 *   C5  the payslip shows the adjustment as its own line.
 *   C6  finalizing is refused once the year's figures changed since the run
 *       was computed (recompute first).
 *   C7  any other regular run is not annualized.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput, ComputePayComponent } from "@/lib/payroll/types";
import type { BirWithholdingPayload } from "@/lib/statutory/types";
import { DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p171ct${sfx}`;
const id = (s: string) => `p171c${s}${sfx}`;

import { createDraftRun, finalizeRun } from "@/lib/payroll/persist";
import { buildPayslipPdfData } from "@/lib/payslip/pdf-data";
import { withTenant } from "@/lib/with-tenant";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (floor: number, fixedTax: number, plusRate: number) => ({ floor, fixedTax, plusRate });
const TRAIN_2018 = {
  frequencies: {
    SEMI_MONTHLY: [row(0, 0, 0), row(1_041_700, 0, 0.2), row(1_666_700, 125_000, 0.25), row(3_333_300, 541_667, 0.3), row(8_333_300, 2_041_667, 0.32), row(33_333_300, 10_041_667, 0.35)],
    MONTHLY: [row(0, 0, 0), row(2_083_300, 0, 0.2), row(3_333_300, 250_000, 0.25), row(6_666_700, 1_083_333, 0.3), row(16_666_700, 4_083_333, 0.32), row(66_666_700, 20_083_333, 0.35)],
    ANNUAL: [row(0, 0, 0), row(25_000_000, 0, 0.2), row(40_000_000, 3_000_000, 0.25), row(80_000_000, 13_000_000, 0.3), row(200_000_000, 49_000_000, 0.32), row(800_000_000, 241_000_000, 0.35)],
  },
} as unknown as BirWithholdingPayload;

const allowance = (amountCents: bigint): ComputePayComponent => ({
  id: "ot", code: "OT", name: "Overtime", kind: "OTHER_EARNING", taxability: "TAXABLE", amountCents, deMinimisCode: null,
});
function may2018(halfCents: bigint, extra: Partial<ComputeInput> = {}): ComputeInput {
  return {
    employee: {
      id: "p171c", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null,
      hireDate: d("2015-01-05"), separationDate: null,
    },
    salary: { basicSalaryCents: halfCents * 2n, salaryType: "MONTHLY" },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d("2018-05-01"), end: d("2018-05-15"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 11, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0,
      regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0,
    },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: TRAIN_2018, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: false,
    runType: "REGULAR",
    ...extra,
  };
}

describe("PAY-171 cumulative average method (RR 11-2018)", () => {
  it("C1 (T1) Canlubo 1 to 15 May 2018: nothing withheld on the year's average", () => {
    const r = computeSheet(may2018(905_500n, {
      payComponents: [allowance(154_500n)],
      cumulativeAverage: { priorTaxableCents: 9_331_328n - 1_060_000n, priorWithheldCents: 0n, usedThisYear: false },
    }));
    expect(r.grossTaxableIncomeCents).toBe(1_060_000n);
    expect(r.withholdingTaxCents).toBe(0n);
    expect(r.statutoryBreakdown.bir).toMatchObject({ method: "CUMULATIVE_AVERAGE", averageTaxableCents: "1036814", periodsSoFar: 9 });
    // Without the method, the table alone: 20% of ₱183.00.
    expect(computeSheet(may2018(905_500n, { payComponents: [allowance(154_500n)] })).withholdingTaxCents).toBe(3_660n);
  });

  it("C2 once used this year, the method stays", () => {
    const r = computeSheet(may2018(1_500_000n, {
      cumulativeAverage: { priorTaxableCents: 12_000_000n, priorWithheldCents: 500_000n, usedThisYear: true },
    }));
    // Average (120,000 + 15,000) / 9 = 15,000 -> 916.60 a period x 9 = 8,249.40, less 5,000 withheld.
    expect(r.statutoryBreakdown.bir?.method).toBe("CUMULATIVE_AVERAGE");
    expect(r.withholdingTaxCents).toBe(824_940n - 500_000n);
  });

  it("C3 a basic above the level is taxed by the table", () => {
    const r = computeSheet(may2018(1_500_000n, {
      cumulativeAverage: { priorTaxableCents: 12_000_000n, priorWithheldCents: 800_000n, usedThisYear: false },
    }));
    expect(r.statutoryBreakdown.bir?.method).toBeUndefined();
    expect(r.withholdingTaxCents).toBe(91_660n);
  });
});

describeDb("PAY-171 year-end adjustment on the last regular run (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const E = id("emp");
  let decId = "";

  const finalized = async (key: string, start: string, end: string, taxable: bigint, withheld: bigint) => {
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, $3, $4, 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', now())`,
      [id(key), T, start, end],
    );
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 3000000, 261, false,
         $5, $5, $5, $6, $5, '[]', '[]', '{}', '{}', now())`,
      [`${id(key)}-s`, T, id(key), E, taxable, withheld],
    );
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2022-01-03T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P171C${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", TRAIN_2018],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2018-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p171c-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P171C', $1, '2015-01-05', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2015-01-05', 3000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    // 2021 so far: ₱355,451.14 taxable, ₱23,172.03 withheld.
    await finalized("ytd", "2021-01-01", "2021-12-15", 35_545_114n, 2_317_203n);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmploymentTerm", "Employee", "StatutoryRule"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("C4 the year's last regular run carries the year-end adjustment: ₱1.60", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2021-12-16"), periodEnd: d("2021-12-31"), cycle: "SEMI_MONTHLY",
    });
    decId = book.id;
    const s = (await q(
      `SELECT "grossTaxableIncomeCents"::text g, "withholdingTaxCents"::text w, "annualizationData" a FROM "PayrollSheet" WHERE "payrollBookId" = $1`,
      [decId],
    )).rows[0];
    expect(s.g).toBe("1500000");
    expect(s.a).toMatchObject({ ytdRegularTaxableCents: "37045114", trueAnnualLiabilityCents: "2409023", trueUpCents: "160" });
    expect(s.w).toBe((91_660n + 160n).toString());
  });

  it("C5 the payslip shows the adjustment as its own line", async () => {
    const sheet = await withTenant(T, (tx) => tx.payrollSheet.findFirstOrThrow({ where: { payrollBookId: decId, employeeId: E } }));
    const data = buildPayslipPdfData({
      company: { name: "Co", tradeName: null, address: null, city: null, province: null, zipCode: null },
      book: { periodStart: d("2021-12-16"), periodEnd: d("2021-12-31"), cycle: "SEMI_MONTHLY", runType: "REGULAR", finalizedAt: null },
      sheet,
      employee: { employeeNumber: "E", firstName: "A", lastName: "B", position: null, department: null, branch: null, statutoryIds: [] },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0,
        leaveBalances: [],
      },
    });
    const lines = Object.fromEntries(data.statutory.map((l) => [l.label, l.amount]));
    expect(lines["Withholding tax"]).toBe(91_660n);
    expect(lines["Withholding tax adjustment (year-end)"]).toBe(160n);
  });

  it("C6 finalizing is refused once the year's figures changed", async () => {
    await finalized("late", "2021-12-01", "2021-12-10", 10_000n, 0n);
    await expect(finalizeRun(T, decId, "p171c-hr")).rejects.toThrow(/Recompute the run, then finalize/);
  });

  it("C7 any other regular run is not annualized", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: d("2022-01-01"), periodEnd: d("2022-01-15"), cycle: "SEMI_MONTHLY",
    });
    const a = (await q(`SELECT "annualizationData" a FROM "PayrollSheet" WHERE "payrollBookId" = $1`, [book.id])).rows[0].a;
    expect(a).toBeNull();
  });
});
