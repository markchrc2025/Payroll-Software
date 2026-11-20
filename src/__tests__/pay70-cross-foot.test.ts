/**
 * PAY-70 (plan 1.15). The cross-foot set, ratified by Mark on 17 Nov 2026
 * (Q4b): (1) each payslip gross minus deductions equals net; (2) the payroll
 * register equals the sum of its payslips; (3) the bank file total equals the
 * run's net pay; (4) SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF totals equal
 * the month's payslip contributions; (5) BIR 1601-C withholding equals the
 * month's payslip withholding; (6) each 2316 equals the sum of that employee's
 * payslips for the year, and the alphalist equals all the 2316s.
 *
 * Hand figures. Ana: gross 33,300.00, SSS 1,000.00, PhilHealth 625.00,
 * Pag-IBIG 200.00, tax 2,864.50, loan 1,500.00, other deduction 500.00,
 * reimbursement 250.00: net 26,860.50. Ben: gross 9,000.00, other deduction
 * 9,400.00: net (400.00), owed to the company.
 *
 *   T1  a consistent run ties out on (1), (2) and (3) (fails on main: no
 *       cross-foot module).
 *   T2  a payslip that does not add up fails (1) and is named.
 *   T3  a register total that differs from its payslips fails (2), by column.
 *   T4  the bank file credits positive net pay only; a wrong total fails (3);
 *       a draft run has no bank file check.
 *   T5  (4) and (5): each remittance total against the month's payslips.
 *   T6  (6): each 2316 against the payslips, and the alphalist against the 2316s.
 *   T7  the checks are shown: "Ties out" in green, "Does not tie out" with
 *       both figures and the difference; on the run page and the report cards.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  alphalistChecks, allTieOut, bir1601cCheck, bir2316Checks, netFromParts, pagibigMcrfCheck,
  philhealthRf1Check, registerTotals, runCrossFoot, sssR3Check, type PayslipFigures,
} from "@/lib/payroll/reports/cross-foot";
import { CrossFootPanel } from "@/components/reports/CrossFootPanel";

const c = (pesos: string) => BigInt(pesos.replace(/[,.]/g, ""));
const ANA: PayslipFigures = {
  employeeLabel: "Santos, Ana (E-1)",
  grossCompensationCents: c("33,300.00"), sssEeCents: c("1,000.00"), philhealthEeCents: c("625.00"),
  pagibigEeCents: c("200.00"), withholdingTaxCents: c("2,864.50"), loanDeductionsCents: c("1,500.00"),
  adjustmentDeductionsCents: c("500.00"), nontaxableAdditionsCents: c("250.00"), netPayCents: c("26,860.50"),
};
const BEN: PayslipFigures = {
  employeeLabel: "Cruz, Ben (E-2)",
  grossCompensationCents: c("9,000.00"), sssEeCents: 0n, philhealthEeCents: 0n, pagibigEeCents: 0n,
  withholdingTaxCents: 0n, loanDeductionsCents: 0n, adjustmentDeductionsCents: c("9,400.00"),
  nontaxableAdditionsCents: 0n, netPayCents: -c("400.00"),
};
const byId = (list: ReturnType<typeof runCrossFoot>, id: string) => list.find((x) => x.id === id)!;

describe("PAY-70 cross-foot checks (1) to (3): one run", () => {
  it("T1 a consistent run ties out", () => {
    expect(netFromParts(ANA)).toBe(c("26,860.50"));
    expect(netFromParts(BEN)).toBe(-c("400.00"));
    const sheets = [ANA, BEN];
    const register = registerTotals(sheets);
    expect(register).toMatchObject({
      payslips: 2, grossCents: c("42,300.00"), withholdingTaxCents: c("2,864.50"),
      otherDeductionsCents: c("9,900.00"), additionsCents: c("250.00"), netPayCents: c("26,460.50"),
    });
    const checks = runCrossFoot({ sheets, register, bankFileTotalCents: c("26,860.50") });
    expect(checks.map((x) => x.id)).toEqual(["Q4-1", "Q4-2", "Q4-2x", "Q4-3"]);
    expect(allTieOut(checks)).toBe(true);
    expect(byId(checks, "Q4-2x")).toMatchObject({ expectedCents: "2646050", actualCents: "2646050" });
    expect(byId(checks, "Q4-3")).toMatchObject({ expectedCents: "2686050", actualCents: "2686050", ok: true });
    expect(byId(checks, "Q4-3").detail).toBe("1 payslip(s) with zero or negative net pay are not in the bank file.");
  });

  it("T2 a payslip that does not add up fails and is named", () => {
    const bad = { ...ANA, netPayCents: c("26,860.51") };
    const sheets = [bad, BEN];
    const checks = runCrossFoot({ sheets, register: registerTotals(sheets), bankFileTotalCents: null });
    expect(byId(checks, "Q4-1")).toMatchObject({ ok: false, expectedCents: "2646050", actualCents: "2646051" });
    expect(byId(checks, "Q4-1").detail).toBe("1 payslip(s) do not add up, first: Santos, Ana (E-1).");
    // Two payslips off by opposite amounts still fail, though the sums agree.
    const offsetting = [{ ...ANA, netPayCents: ANA.netPayCents + 100n }, { ...BEN, netPayCents: BEN.netPayCents - 100n }];
    const two = runCrossFoot({ sheets: offsetting, register: registerTotals(offsetting), bankFileTotalCents: null });
    expect(byId(two, "Q4-1")).toMatchObject({ ok: false, expectedCents: "2646050", actualCents: "2646050" });
    expect(allTieOut(two)).toBe(false);
  });

  it("T3 a register total that differs from its payslips fails, by column", () => {
    const sheets = [ANA, BEN];
    const register = { ...registerTotals(sheets), withholdingTaxCents: c("2,864.00"), loanDeductionsCents: c("1,400.00") };
    const checks = runCrossFoot({ sheets, register, bankFileTotalCents: null });
    expect(byId(checks, "Q4-1").ok).toBe(true);
    expect(byId(checks, "Q4-2")).toMatchObject({ ok: false, detail: "Totals that differ: withholding tax, loans." });
    // 42,300.00 - 1,825.00 - 2,864.00 - 1,400.00 - 9,900.00 + 250.00 = 26,561.00, not 26,460.50.
    expect(byId(checks, "Q4-2x")).toMatchObject({ ok: false, expectedCents: "2656100", actualCents: "2646050" });
  });

  it("T4 the bank file credits positive net pay only", () => {
    const sheets = [ANA, BEN];
    const register = registerTotals(sheets);
    // Crediting the run's whole net (26,460.50) would short Ana by Ben's debt.
    const wrong = runCrossFoot({ sheets, register, bankFileTotalCents: c("26,460.50") });
    expect(byId(wrong, "Q4-3")).toMatchObject({ ok: false, expectedCents: "2686050", actualCents: "2646050" });
    const draft = runCrossFoot({ sheets, register, bankFileTotalCents: null });
    expect(draft.map((x) => x.id)).toEqual(["Q4-1", "Q4-2", "Q4-2x"]);
  });
});

describe("PAY-70 cross-foot checks (4) to (6): remittances and BIR", () => {
  const month = { sssCents: c("4,250.00"), philhealthCents: c("1,250.00"), pagibigCents: c("400.00"), withholdingTaxCents: c("2,864.50") };

  it("T5 each remittance total against the month's payslips", () => {
    expect(sssR3Check(c("4,250.00"), month)).toMatchObject({ id: "Q4-4a", ok: true });
    expect(philhealthRf1Check(c("1,250.00"), month)).toMatchObject({ id: "Q4-4b", ok: true });
    expect(pagibigMcrfCheck(c("400.00"), month)).toMatchObject({ id: "Q4-4c", ok: true });
    expect(bir1601cCheck(c("2,864.50"), month)).toMatchObject({ id: "Q4-5", ok: true });
    expect(sssR3Check(c("4,220.00"), month)).toMatchObject({ ok: false, expectedCents: "425000", actualCents: "422000" });
    expect(philhealthRf1Check(c("1,250.01"), month).ok).toBe(false);
    expect(pagibigMcrfCheck(0n, month).ok).toBe(false);
    expect(bir1601cCheck(c("2,864.00"), month)).toMatchObject({ ok: false, expectedCents: "286450", actualCents: "286400" });
  });

  it("T6 each 2316 against the payslips, and the alphalist against the 2316s", () => {
    const ana = { grossCents: c("158,300.00"), taxableCents: c("64,475.00"), withholdingTaxCents: c("7,864.50") };
    const ben = { grossCents: c("17,265.25"), taxableCents: c("1,543.00"), withholdingTaxCents: 0n };
    const payslips = new Map([["ana", ana], ["ben", ben]]);
    const same = bir2316Checks(new Map([["ana", ana], ["ben", ben]]), payslips);
    expect(same.map((x) => x.id)).toEqual(["Q4-6a", "Q4-6b", "Q4-6c"]);
    expect(allTieOut(same)).toBe(true);
    expect(same[0]).toMatchObject({ expectedCents: "17556525", actualCents: "17556525" });
    // One certificate short on tax withheld.
    const off = bir2316Checks(new Map([["ana", { ...ana, withholdingTaxCents: c("7,000.00") }], ["ben", ben]]), payslips);
    expect(off[2]).toMatchObject({ ok: false, expectedCents: "786450", actualCents: "700000" });
    expect(off[2]!.detail).toBe("1 certificate(s) differ from their payslips; 0 employee(s) with payslips have no certificate.");
    // Two certificates swapped: the sums agree but each one is wrong.
    const swapped = bir2316Checks(new Map([["ana", ben], ["ben", ana]]), payslips);
    expect(allTieOut(swapped)).toBe(false);
    // An employee with payslips and no certificate.
    const missing = bir2316Checks(new Map([["ana", ana]]), payslips);
    expect(missing[0]).toMatchObject({ ok: false });
    expect(missing[0]!.detail).toContain("1 employee(s) with payslips have no certificate.");

    const all = { grossCents: c("175,565.25"), taxableCents: c("66,018.00"), withholdingTaxCents: c("7,864.50") };
    expect(allTieOut(alphalistChecks(all, all))).toBe(true);
    const short = alphalistChecks({ ...all, taxableCents: c("66,000.00") }, all);
    expect(short.map((x) => [x.id, x.ok])).toEqual([["Q4-6d", true], ["Q4-6e", false], ["Q4-6f", true]]);
  });
});

describe("PAY-70 the checks are shown on the documents", () => {
  it("T7 ties out in green, does not tie out with both figures", () => {
    const sheets = [ANA, BEN];
    const good = renderToStaticMarkup(createElement(CrossFootPanel, { checks: runCrossFoot({ sheets, register: registerTotals(sheets), bankFileTotalCents: c("26,860.50") }) }));
    expect(good).toContain('data-ties-out="yes"');
    expect(good).toContain("Ties out: 4 cross-foot checks passed");
    const bad = renderToStaticMarkup(createElement(CrossFootPanel, { checks: [bir1601cCheck(c("2,864.00"), { sssCents: 0n, philhealthCents: 0n, pagibigCents: 0n, withholdingTaxCents: c("2,864.50") })] }));
    expect(bad).toContain('data-ties-out="no"');
    expect(bad).toContain("Does not tie out: 1 of 1 cross-foot check failed");
    expect(bad).toContain("payslips 2,864.50, document 2,864.00, difference (0.50)");
    expect(renderToStaticMarkup(createElement(CrossFootPanel, { checks: [] }))).toBe("");
    expect(readFileSync("src/app/(dashboard)/reports/page.tsx", "utf8")).toContain("<CrossFootPanel checks={result.crossFoot}");
    expect(readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8")).toContain("<RunCrossFoot runId={run.id}");
    expect(good + bad).not.toMatch(/[–—]/);
  });
});
