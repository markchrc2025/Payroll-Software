/**
 * PAY-139: the payslip PDF, redesigned after Mark's two reference payslips
 * (PMFTC-style two columns, provable Net Pay box, units and rate, employer
 * share, masked IDs, YTD, attendance summary, leave; A4).
 *
 * The old PDF did not add up (PAY-138): it listed the employee's own
 * SSS/PhilHealth/Pag-IBIG as an earning that the total left out, and it
 * subtracted late/undertime twice (gross already nets it).
 *
 *   P1  the earnings column adds up to Gross Pay in every case.
 *   P2  the Net Pay box adds up to Net Pay in every case; anything the
 *       engine moved elsewhere shows as an explicit "Other items" line.
 *   P3  contributions are never an earning; late is never a deduction.
 *   P4  government IDs and the bank account show only the last 4.
 *   P5  a regular first cutoff without contributions says why.
 *   P6  the renderer makes a one-page PDF with Inter embedded (and, where
 *       pdftotext exists, the peso sign and the key figures in the text).
 *   P7  admin download, employee download and the stored copy all use the
 *       same loader and renderer; the employee route never takes an
 *       employee id from the request.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPayslipPdfData, maskId, peso, type PayslipPdfSource } from "@/lib/payslip/pdf-data";
import { renderPayslipPdf } from "@/lib/payslip/pdf-document";

type Sheet = PayslipPdfSource["sheet"];

function source(over: Partial<Sheet> = {}, more: Partial<PayslipPdfSource> = {}): PayslipPdfSource {
  const sheet: Sheet = {
    id: "cmwhz0usb001801p5mspptjkz",
    salaryTypeSnapshot: "MONTHLY",
    basicSalaryCentsSnapshot: 3_000_000n,
    workingDaysDenominatorSnapshot: 261,
    taxClassificationSnapshot: "REGULAR",
    statutoryDeductedSnapshot: true,
    basePayCents: 1_500_000n,
    lateUndertimeDeductionCents: 0n,
    otPayCents: 0n,
    nsdPayCents: 0n,
    holidayPayCents: 0n,
    restDayPayCents: 0n,
    hazardPayCents: 0n,
    taxableAllowancesCents: 0n,
    grossCompensationCents: 1_500_000n,
    grossTaxableIncomeCents: 1_255_000n,
    sssEeCents: 150_000n,
    sssErCents: 300_000n,
    sssEcCents: 3_000n,
    philhealthEeCents: 75_000n,
    philhealthErCents: 75_000n,
    pagibigEeCents: 20_000n,
    pagibigErCents: 20_000n,
    withholdingTaxCents: 31_995n,
    nontaxableAdditionsCents: 0n,
    loanDeductionsCents: 0n,
    adjustmentDeductionsCents: 0n,
    netPayCents: 1_223_005n,
    periodInputSnapshot: { daysWorked: 11, unpaidLeaveDays: 0, lateUndertimeMinutes: 0, regularOtHours: 0 },
    statutoryBreakdown: { deducted: true, bases: { sssMscCents: "3000000", philHealthMscCents: "3000000", pagibigMfsCents: "1000000" } },
    loanPaymentsApplied: [],
    adjustmentsApplied: [],
    expenseClaimsApplied: [],
    ...over,
  };
  return {
    company: { name: "Sentire QA Co.", address: "Champaca Street", city: "Marikina City", province: "Metro Manila", zipCode: "1809" },
    book: { periodStart: new Date("2026-11-16"), periodEnd: new Date("2026-11-30"), cycle: "SEMI_MONTHLY", runType: "REGULAR", finalizedAt: new Date("2026-11-28") },
    sheet,
    employee: {
      employeeNumber: "EMP-0001", firstName: "Ana", middleName: null, lastName: "Santos", position: null, department: "Finance", branch: "Head Office",
      bankName: "BPI", bankAccountNumber: "1234-5600-0329",
      statutoryIds: [{ type: "TIN", number: "123-456-789-000" }, { type: "SSS", number: "34-1234567-8" }],
    },
    extras: {
      ytd: { grossCents: "3000000", wtaxCents: "100740", basicCents: "3000000", released13thMonthCents: "0", accrued13thMonthCents: "250000", sssEeCents: "150000", philhealthEeCents: "75000", pagibigEeCents: "20000" },
      tardinessMinutes: 0,
      leaveBalances: [{ code: "VL", name: "Vacation leave", available: "10.50" }],
    },
    ...more,
  };
}

// The awkward cases: late time, a non-taxable allowance inside gross, a loan,
// a deduction adjustment, a reimbursement after tax, and a net the engine
// moved for a reason the payslip lines cannot see.
const late = source({
  lateUndertimeDeductionCents: 39_655n,
  otPayCents: 215_517n,
  grossCompensationCents: 1_500_000n - 39_655n + 215_517n + 100_000n, // + ₱1,000 non-taxable allowance
  periodInputSnapshot: { daysWorked: 11, lateUndertimeMinutes: 23, regularOtHours: 2.5, nightDiffOtHours: 1 },
  loanDeductionsCents: 125_000n,
  loanPaymentsApplied: [{ loanId: "l1", loanType: "SSS", amountCents: "125000", balanceBeforeCents: "1500000", balanceAfterCents: "1375000" }],
  adjustmentDeductionsCents: 50_000n,
  nontaxableAdditionsCents: 150_000n,
  adjustmentsApplied: [
    { id: "a1", kind: "DEDUCTION", amountCents: "50000", isTaxable: false, reason: "Uniform" },
    { id: "a2", kind: "ADDITION", amountCents: "150000", isTaxable: false, reason: "Rice allowance" },
  ],
});
late.sheet.netPayCents = late.sheet.grossCompensationCents - (150_000n + 75_000n + 20_000n + 31_995n) - 125_000n - 50_000n + 150_000n;
const firstCutoff = source({
  statutoryDeductedSnapshot: false, sssEeCents: 0n, sssErCents: 0n, sssEcCents: 0n, philhealthEeCents: 0n, philhealthErCents: 0n,
  pagibigEeCents: 0n, pagibigErCents: 0n, withholdingTaxCents: 68_745n, netPayCents: 1_431_255n,
  statutoryBreakdown: { deducted: false, bases: { sssMscCents: "0", philHealthMscCents: "0", pagibigMfsCents: "0" } },
});
const moved = source({ netPayCents: 1_223_005n + 12_345n }); // e.g. a final-pay item outside the lines
const cases = { regular: source(), late, firstCutoff, moved };

describe("PAY-139 payslip PDF", () => {
  it("P1 the earnings column adds up to Gross Pay", () => {
    for (const [name, src] of Object.entries(cases)) {
      const d = buildPayslipPdfData(src);
      expect(d.earnings.reduce((s, l) => s + l.amount, 0n), name).toBe(d.gross);
    }
    const d = buildPayslipPdfData(late);
    expect(d.earnings.map((l) => l.label)).toEqual(["Basic pay", "Late / undertime", "Overtime pay", "Non-taxable allowances"]);
    expect(d.earnings[1]).toMatchObject({ amount: -39_655n, units: "23 min" });
    expect(d.earnings[2].units).toBe("2.5 hrs"); // night-diff OT hours are not counted twice
    expect(d.earnings[0]).toMatchObject({ units: "11 days", rate: "₱30,000.00/mo" });
  });

  it("P2 the Net Pay box adds up to Net Pay", () => {
    for (const [name, src] of Object.entries(cases)) {
      const d = buildPayslipPdfData(src);
      const total = d.net.rows.reduce((s, r) => (r.sign === "-" ? s - r.amount : s + r.amount), 0n);
      expect(total, name).toBe(d.net.netPay);
      expect(d.net.netPay, name).toBe(src.sheet.netPayCents);
    }
    expect(buildPayslipPdfData(moved).net.rows.at(-1)).toMatchObject({ label: "Other items", amount: 12_345n, sign: "+" });
    expect(buildPayslipPdfData(late).net.rows.map((r) => r.label)).toEqual(["Gross pay", "Statutory deductions", "Other deductions", "Additions after tax"]);
  });

  it("P3 contributions are never an earning; late is never a deduction", () => {
    const d = buildPayslipPdfData(late);
    const earningLabels = d.earnings.map((l) => l.label.toLowerCase()).join("|");
    expect(earningLabels).not.toMatch(/sss|philhealth|pag-ibig|contribution|non-taxable comp/);
    const deductionLabels = [...d.statutory, ...d.other].map((l) => l.label.toLowerCase()).join("|");
    expect(deductionLabels).not.toMatch(/late|undertime/);
    expect(d.statutoryTotal).toBe(150_000n + 75_000n + 20_000n + 31_995n);
    expect(d.other.map((l) => [l.label, l.rate])).toEqual([["SSS loan", "Balance ₱13,750.00"], ["Uniform", undefined]]);
    expect(d.employerTotal).toBe(300_000n + 3_000n + 75_000n + 20_000n);
  });

  it("P4 IDs and the bank account show only the last 4", () => {
    expect(maskId("123-456-789-000")).toBe("•••• 9000");
    expect(maskId("")).toBeNull();
    const d = buildPayslipPdfData(source());
    expect(d.employee.ids).toEqual([
      { label: "TIN", value: "•••• 9000" },
      { label: "SSS", value: "•••• 5678" },
      { label: "PhilHealth", value: "Not on file" },
      { label: "Pag-IBIG", value: "Not on file" },
    ]);
    expect(d.bank).toBe("BPI •••• 0329");
    expect(JSON.stringify(d, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/123-456|1234-5600|34-1234567/);
  });

  it("P5 a regular cutoff without contributions says they come on the other cutoff", () => {
    expect(buildPayslipPdfData(firstCutoff).statutoryNote).toMatch(/other cutoff/);
    expect(buildPayslipPdfData(source()).statutoryNote).toBeNull();
    expect(peso(-39_655n)).toBe("−₱396.55");
  });

  it("P6 renders a one-page A4 PDF with Inter embedded", async () => {
    const buf = await renderPayslipPdf(buildPayslipPdfData(late));
    const text = buf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(1);
    expect(text).toMatch(/Inter-Regular/);
    expect(text).toMatch(/Inter-Bold/);
    expect(text).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);

    let hasPdftotext = true;
    try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { hasPdftotext = false; }
    if (hasPdftotext) {
      const dir = mkdtempSync(path.join(tmpdir(), "pay139-"));
      writeFileSync(path.join(dir, "p.pdf"), buf);
      const out = execFileSync("pdftotext", ["-layout", path.join(dir, "p.pdf"), "-"], { encoding: "utf8" });
      for (const s of ["PAYSLIP", "Gross pay", "NET PAY", "₱14,738.67", "₱17,758.62", "EMPLOYER SHARE", "YEAR TO DATE", "•••• 9000", "Paid to BPI •••• 0329"]) {
        expect(out, s).toContain(s);
      }
    }
  });

  it("P7 one loader and one renderer for every copy; ESS takes the employee from the session", () => {
    for (const f of [
      "src/app/api/payroll/runs/[id]/payslips/[employeeId]/pdf/route.ts",
      "src/app/api/ess/payslips/[bookId]/pdf/route.ts",
      "src/lib/jobs/handlers/payslip-publish.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/loadPayslipPdfData\(tx, \{/);
      expect(src, f).toMatch(/renderPayslipPdf\(/);
    }
    const ess = readFileSync("src/app/api/ess/payslips/[bookId]/pdf/route.ts", "utf8");
    expect(ess).toMatch(/employeeId: ctx\.employeeId/);
    expect(ess).not.toMatch(/searchParams|req\.json/);
    const client = readFileSync("src/components/payslip/payslip-detail.tsx", "utf8");
    expect(client).not.toMatch(/jspdf/i);
  });
});
