/**
 * PAY-61: a daily-paid employee can net below zero. Mark's ruling, 17 Nov
 * 2026: option B, negative net pay is allowed. He added that a net pay of
 * zero should come from a DTR the immediate supervisor did not approve.
 *
 *   N1  (T1) a negative or zero net never reaches a bank file: every bank
 *       route keeps only sheets with a net above zero. Before, the formatters
 *       printed the absolute amount, so an employee who owed ₱500 was
 *       credited ₱500 while the batch total fell by ₱500.
 *   N2  the engine keeps a negative net (no hidden floor): a daily-paid
 *       employee with one approved day whose contributions are more than
 *       the day's pay nets below zero, and net = pay less deductions.
 *   N3  no approved DTR days: no pay, no contributions, net pay zero.
 *   N4  the run page warns about a net below zero and shows it in red; Pay
 *       Rules no longer says net pay can never go negative.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import { formatBdoFile } from "@/lib/payroll/bank-files/bdo";
import { payableSheets } from "@/lib/payroll/bank-files/types";
import type { ComputeInput } from "@/lib/payroll/types";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function dailyPaid(daysWorked: number): ComputeInput {
  return {
    employee: {
      id: "p61-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d("2025-01-06"),
      separationDate: null,
    },
    salary: { basicSalaryCents: 69_500n, salaryType: "DAILY" },
    tenant: {
      workingDaysDenominator: 261,
      statutoryCutoffRule: "FIRST_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
      allowNegativeFinalPay: true,
    },
    period: { start: d("2026-11-01"), end: d("2026-11-15"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked,
      lateUndertimeMinutes: 0,
      regularOtHours: 0,
      restDayHours: 0,
      specialHolidayHours: 0,
      regularHolidayHours: 0,
      nightDiffHours: 0,
      hazardHours: 0,
      unpaidLeaveDays: 0,
    },
    payComponents: [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: true,
    runType: "REGULAR",
  };
}

describe("PAY-61 negative net pay is allowed and never credited", () => {
  it("N1 (T1) only sheets with a net above zero reach a bank file", () => {
    const sheets = [
      { employeeId: "a", netPayCents: 1_000_000n },
      { employeeId: "b", netPayCents: -50_000n },
      { employeeId: "c", netPayCents: 0n },
    ];
    expect(payableSheets(sheets).map((s) => s.employeeId)).toEqual(["a"]);

    const file = formatBdoFile({
      companyName: "Co",
      valueDate: d("2026-11-15"),
      batchReference: "B1",
      rows: payableSheets(sheets).map((s) => ({
        employeeNumber: s.employeeId, accountNumber: "1", accountName: "X", netPayCents: s.netPayCents,
      })),
    });
    expect(file.split("\r\n")[0]).toBe("H|B1|11152026|Co|10000.00|1");
    expect(file).not.toContain("500.00");

    const dir = "src/app/api/payroll/runs/[id]/bank-files";
    const banks = readdirSync(dir);
    expect(banks.sort()).toEqual(["bdo", "bpi", "landbank", "metrobank", "pnb", "unionbank"]);
    for (const bank of banks) {
      const route = readFileSync(`${dir}/${bank}/route.ts`, "utf8");
      expect(route, bank).toContain("const rows = payableSheets(book.sheets).map(");
    }
  });

  it("N2 the engine keeps a negative net; it equals pay less deductions", () => {
    const r = computeSheet(dailyPaid(1));
    expect(r.grossCompensationCents).toBe(69_500n);
    const contributions = r.sssEeCents + r.philhealthEeCents + r.pagibigEeCents;
    expect(contributions).toBeGreaterThan(r.grossCompensationCents);
    expect(r.netPayCents).toBeLessThan(0n);
    expect(r.netPayCents).toBe(r.grossCompensationCents - contributions - r.withholdingTaxCents);
  });

  it("N3 no approved DTR days: no pay, no contributions, net zero", () => {
    const r = computeSheet(dailyPaid(0));
    expect(r.grossCompensationCents).toBe(0n);
    expect(r.sssEeCents + r.philhealthEeCents + r.pagibigEeCents).toBe(0n);
    expect(r.netPayCents).toBe(0n);
  });

  it("N4 the run page warns; Pay Rules describes negative net honestly", () => {
    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(page).toContain('data-testid="negative-net-warning"');
    expect(page).toContain("left out of the bank files");
    expect(page).toMatch(/BigInt\(s\.netPayCents\) < 0n \? " text-red-600"/);
    const rules = readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8");
    expect(rules).not.toContain("net pay can never go negative");
    expect(rules).toContain("Net pay can still go below zero when contributions, tax and other deductions are more than the period's pay");
  });
});
