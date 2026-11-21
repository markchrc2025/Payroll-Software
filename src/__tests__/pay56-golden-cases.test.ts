/**
 * PAY-56 (1.1, launch gate 4): the golden gross-to-net cases of
 * docs/GOLDEN_CASES_1.1.md, each worked by hand from the 2026 statutory
 * baseline, through the engine, to the centavo. Every pay frequency is
 * covered (REP-31) and semi-monthly contributions are counted once a month
 * (REP-29).
 *
 * The expected figures are the document's; a failure means the engine
 * changed what an employee is paid. Do not change an expected figure to make
 * a case pass: work it again by hand and report it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { DE_MINIMIS_2025, MIN_WAGE_2025, PAGIBIG_2024, PHIC_2025, SSS_2026, TRAIN_2023 } from "@/lib/statutory/baseline-2026";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const c = (pesos: string) => BigInt(pesos.replace(/[,.]/g, ""));

function input(o: {
  salary: string; type: "MONTHLY" | "DAILY" | "WEEKLY"; cycle: "MONTHLY" | "SEMI_MONTHLY" | "WEEKLY";
  start: string; end: string; days?: number; tax?: "REGULAR" | "MWE"; rule?: "FIRST_CUTOFF" | "SECOND_CUTOFF";
  pi?: Partial<ComputeInput["periodInput"]>;
}): ComputeInput {
  return {
    employee: { id: "g", taxClassification: o.tax ?? "REGULAR", region: "NCR", payFrequency: o.cycle, standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null, hireDate: d("2024-01-08"), separationDate: null },
    salary: { basicSalaryCents: c(o.salary), salaryType: o.type },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: o.rule ?? "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d(o.start), end: d(o.end), cycle: o.cycle },
    periodInput: { daysWorked: o.days ?? 0, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0, regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0, ...o.pi },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS_2026, philHealth: PHIC_2025, pagibig: PAGIBIG_2024, bir: TRAIN_2023, minWage: MIN_WAGE_2025, deMinimis: DE_MINIMIS_2025 },
    runType: "REGULAR",
  };
}

type Expected = [gross: string, sss: string, phic: string, hdmf: string, taxable: string, tax: string, net: string];
const CASES: [string, ComputeInput, Expected][] = [
  ["G1", input({ salary: "30,000.00", type: "MONTHLY", cycle: "MONTHLY", start: "2026-11-01", end: "2026-11-30", days: 21 }),
    ["30,000.00", "1,500.00", "750.00", "200.00", "27,550.00", "1,007.55", "26,542.45"]],
  ["G2a", input({ salary: "30,000.00", type: "MONTHLY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 10 }),
    ["15,000.00", "1,500.00", "750.00", "200.00", "12,550.00", "319.95", "12,230.05"]],
  ["G2b", input({ salary: "30,000.00", type: "MONTHLY", cycle: "SEMI_MONTHLY", start: "2026-11-16", end: "2026-11-30", days: 11 }),
    ["15,000.00", "0.00", "0.00", "0.00", "15,000.00", "687.45", "14,312.55"]],
  ["G3", input({ salary: "700.00", type: "DAILY", cycle: "WEEKLY", start: "2026-11-02", end: "2026-11-08", days: 6 }),
    ["4,200.00", "0.00", "0.00", "0.00", "4,200.00", "0.00", "4,200.00"]],
  ["G3b", input({ salary: "700.00", type: "DAILY", cycle: "WEEKLY", start: "2026-11-30", end: "2026-12-06", days: 6 }),
    ["4,200.00", "750.00", "380.63", "200.00", "2,869.37", "0.00", "2,869.37"]],
  ["G4", input({ salary: "645.00", type: "DAILY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 13, tax: "MWE" }),
    ["8,385.00", "700.00", "350.72", "200.00", "0.00", "0.00", "7,134.28"]],
  ["G5", input({ salary: "30,000.00", type: "MONTHLY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 10, pi: { lateUndertimeMinutes: 60, regularOtHours: 2, nightDiffHours: 3 } }),
    ["15,310.34", "1,500.00", "750.00", "200.00", "12,860.34", "366.50", "12,493.84"]],
  ["G6", input({ salary: "1,200.00", type: "WEEKLY", cycle: "WEEKLY", start: "2026-11-02", end: "2026-11-08", days: 5 }),
    ["1,200.00", "0.00", "0.00", "0.00", "1,200.00", "0.00", "1,200.00"]],
  ["G7", input({ salary: "150,000.00", type: "MONTHLY", cycle: "MONTHLY", start: "2026-11-01", end: "2026-11-30", days: 21 }),
    ["150,000.00", "1,750.00", "2,500.00", "200.00", "145,550.00", "28,262.45", "117,287.55"]],
  ["G8", { ...input({ salary: "30,000.00", type: "MONTHLY", cycle: "MONTHLY", start: "2026-12-01", end: "2026-12-31" }), runType: "YEAR_END", thirteenthMonthCents: c("30,000.00") },
    ["30,000.00", "0.00", "0.00", "0.00", "0.00", "0.00", "30,000.00"]],
  ["G10", input({ salary: "645.00", type: "DAILY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 13, tax: "MWE", pi: { regularOtHours: 2 } }),
    ["8,586.58", "700.00", "350.72", "200.00", "0.00", "0.00", "7,335.86"]],
  ["G11", input({ salary: "30,000.00", type: "MONTHLY", cycle: "SEMI_MONTHLY", start: "2026-11-16", end: "2026-11-30", days: 11, rule: "SECOND_CUTOFF" }),
    ["15,000.00", "1,500.00", "750.00", "200.00", "12,550.00", "319.95", "12,230.05"]],
  ["G12", input({ salary: "30,000.00", type: "MONTHLY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 9, pi: { unpaidLeaveDays: 1 } }),
    ["13,620.69", "1,500.00", "750.00", "200.00", "11,170.69", "113.05", "11,057.64"]],
  ["G13", { ...input({ salary: "30,000.00", type: "MONTHLY", cycle: "MONTHLY", start: "2026-11-01", end: "2026-11-30", days: 21 }),
    payComponents: [{ id: "rice", code: "RICE", name: "Rice subsidy", kind: "ALLOWANCE", taxability: "DE_MINIMIS", amountCents: c("2,500.00"), deMinimisCode: "RICE_SUBSIDY" }] as unknown as ComputeInput["payComponents"] },
    ["32,500.00", "1,500.00", "750.00", "200.00", "27,550.00", "1,007.55", "29,042.45"]],
  ["G14", input({ salary: "800.00", type: "DAILY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 11 }),
    ["8,800.00", "875.00", "435.00", "200.00", "7,290.00", "0.00", "7,290.00"]],
  ["G15", input({ salary: "800.00", type: "DAILY", cycle: "SEMI_MONTHLY", start: "2026-11-01", end: "2026-11-15", days: 10, pi: { regularHolidayHours: 8 } }),
    ["9,600.00", "875.00", "435.00", "200.00", "8,090.00", "0.00", "8,090.00"]],
];

describe("PAY-56 golden gross-to-net cases (docs/GOLDEN_CASES_1.1.md)", () => {
  for (const [name, inp, [gross, sss, phic, hdmf, taxable, tax, net]] of CASES) {
    it(`${name} to the centavo`, () => {
      const r = computeSheet(inp);
      expect({
        gross: r.grossCompensationCents, sss: r.sssEeCents, phic: r.philhealthEeCents, hdmf: r.pagibigEeCents,
        taxable: r.grossTaxableIncomeCents, tax: r.withholdingTaxCents, net: r.netPayCents,
      }).toEqual({ gross: c(gross), sss: c(sss), phic: c(phic), hdmf: c(hdmf), taxable: c(taxable), tax: c(tax), net: c(net) });
    });
  }

  it("every case in the document is in the suite, and every frequency is covered", () => {
    const doc = readFileSync("docs/GOLDEN_CASES_1.1.md", "utf8");
    const inDoc = [...doc.matchAll(/^\| (G\d+[a-z]?) \|/gm)].map((m) => m[1]);
    expect(inDoc).toEqual(CASES.map(([n]) => n));
    expect(new Set(CASES.map(([, i]) => i.period.cycle))).toEqual(new Set(["MONTHLY", "SEMI_MONTHLY", "WEEKLY"]));
    expect(new Set(CASES.map(([, i]) => i.salary.salaryType))).toEqual(new Set(["MONTHLY", "DAILY", "WEEKLY"]));
  });
});
