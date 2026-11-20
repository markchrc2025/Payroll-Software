/**
 * PAY-70 (plan 1.15). The cross-foot set, ratified by Mark on 17 Nov 2026
 * (Q4b): "(1) each payslip gross minus deductions equals net; (2) the payroll
 * register equals the sum of its payslips (gross, each deduction, net); (3)
 * the bank file total equals the run's net pay; (4) SSS R-3, PhilHealth RF-1
 * and Pag-IBIG MCRF totals equal the month's payslip contributions; (5) BIR
 * 1601-C withholding equals the month's payslip withholding; (6) each 2316
 * equals the sum of that employee's payslips for the year, and the alphalist
 * equals all the 2316s."
 *
 * A check compares two figures reached by different routes: what a document
 * says, and what the payslips add up to. It never changes a figure. A check
 * that fails is shown on the document as "does not tie out".
 *
 * Pure functions, no DB access. Money is centavos.
 */

export interface CrossFootCheck {
  /** Stable id, for example "Q4-5". */
  id: string;
  label: string;
  expectedCents: string;
  actualCents: string;
  ok: boolean;
  /** What to look at when it does not tie out. */
  detail?: string;
}

export function crossFoot(id: string, label: string, expected: bigint, actual: bigint, detail?: string): CrossFootCheck {
  return {
    id,
    label,
    expectedCents: expected.toString(),
    actualCents: actual.toString(),
    ok: expected === actual,
    ...(detail ? { detail } : {}),
  };
}

export const allTieOut = (checks: CrossFootCheck[]) => checks.every((c) => c.ok);

// ---------------------------------------------------------------------------
// (1) to (3): one payroll run
// ---------------------------------------------------------------------------

export interface PayslipFigures {
  employeeLabel?: string;
  grossCompensationCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  withholdingTaxCents: bigint;
  loanDeductionsCents: bigint;
  adjustmentDeductionsCents: bigint;
  /** Reimbursements and other amounts paid outside gross. */
  nontaxableAdditionsCents: bigint;
  netPayCents: bigint;
}

/** Gross, less every deduction, plus amounts paid outside gross. */
export function netFromParts(s: PayslipFigures): bigint {
  return (
    s.grossCompensationCents -
    s.sssEeCents -
    s.philhealthEeCents -
    s.pagibigEeCents -
    s.withholdingTaxCents -
    s.loanDeductionsCents -
    s.adjustmentDeductionsCents +
    s.nontaxableAdditionsCents
  );
}

export interface RegisterTotals {
  payslips: number;
  grossCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  withholdingTaxCents: bigint;
  loanDeductionsCents: bigint;
  otherDeductionsCents: bigint;
  additionsCents: bigint;
  netPayCents: bigint;
}

/** The payroll register's totals row: each column added down the payslips. */
export function registerTotals(sheets: PayslipFigures[]): RegisterTotals {
  const t: RegisterTotals = {
    payslips: sheets.length, grossCents: 0n, sssEeCents: 0n, philhealthEeCents: 0n, pagibigEeCents: 0n,
    withholdingTaxCents: 0n, loanDeductionsCents: 0n, otherDeductionsCents: 0n, additionsCents: 0n, netPayCents: 0n,
  };
  for (const s of sheets) {
    t.grossCents += s.grossCompensationCents;
    t.sssEeCents += s.sssEeCents;
    t.philhealthEeCents += s.philhealthEeCents;
    t.pagibigEeCents += s.pagibigEeCents;
    t.withholdingTaxCents += s.withholdingTaxCents;
    t.loanDeductionsCents += s.loanDeductionsCents;
    t.otherDeductionsCents += s.adjustmentDeductionsCents;
    t.additionsCents += s.nontaxableAdditionsCents;
    t.netPayCents += s.netPayCents;
  }
  return t;
}

/**
 * Checks (1) to (3) for one run. `register` is the totals row the register
 * shows; `bankFileTotalCents` is the total of the bank file's rows (null when
 * the run has no bank file yet).
 */
export function runCrossFoot(input: {
  sheets: PayslipFigures[];
  register: RegisterTotals;
  bankFileTotalCents: bigint | null;
}): CrossFootCheck[] {
  const { sheets, register } = input;
  const off = sheets.filter((s) => netFromParts(s) !== s.netPayCents);
  const computed = sheets.reduce((t, s) => t + netFromParts(s), 0n);
  const stored = sheets.reduce((t, s) => t + s.netPayCents, 0n);
  const checks: CrossFootCheck[] = [
    {
      ...crossFoot("Q4-1", "Each payslip: gross less deductions equals net pay", computed, stored),
      ok: off.length === 0,
      ...(off.length > 0
        ? { detail: `${off.length} payslip(s) do not add up${off[0]?.employeeLabel ? `, first: ${off[0].employeeLabel}` : ""}.` }
        : {}),
    },
  ];

  // (2) the register's totals row against the payslips, column by column, and
  // across: total gross less total deductions equals total net pay.
  const own = registerTotals(sheets);
  const columns: [string, bigint, bigint][] = [
    ["gross pay", own.grossCents, register.grossCents],
    ["SSS", own.sssEeCents, register.sssEeCents],
    ["PhilHealth", own.philhealthEeCents, register.philhealthEeCents],
    ["Pag-IBIG", own.pagibigEeCents, register.pagibigEeCents],
    ["withholding tax", own.withholdingTaxCents, register.withholdingTaxCents],
    ["loans", own.loanDeductionsCents, register.loanDeductionsCents],
    ["other deductions", own.otherDeductionsCents, register.otherDeductionsCents],
    ["net pay", own.netPayCents, register.netPayCents],
  ];
  const wrong = columns.filter(([, a, b]) => a !== b).map(([name]) => name);
  checks.push({
    ...crossFoot("Q4-2", "Payroll register: each total equals the sum of its payslips", own.netPayCents, register.netPayCents),
    ok: wrong.length === 0,
    ...(wrong.length > 0 ? { detail: `Totals that differ: ${wrong.join(", ")}.` } : {}),
  });
  checks.push(
    crossFoot(
      "Q4-2x",
      "Payroll register: total gross less total deductions equals total net pay",
      register.grossCents - register.sssEeCents - register.philhealthEeCents - register.pagibigEeCents -
        register.withholdingTaxCents - register.loanDeductionsCents - register.otherDeductionsCents + register.additionsCents,
      register.netPayCents,
    ),
  );

  // (3) the bank file credits every net pay above zero (PAY-61: a zero or
  // negative net pay is never a credit).
  if (input.bankFileTotalCents !== null) {
    const payable = sheets.filter((s) => s.netPayCents > 0n);
    const notCredited = sheets.length - payable.length;
    checks.push(
      crossFoot(
        "Q4-3",
        "Bank file total equals the run's net pay to be credited",
        payable.reduce((t, s) => t + s.netPayCents, 0n),
        input.bankFileTotalCents,
        notCredited > 0 ? `${notCredited} payslip(s) with zero or negative net pay are not in the bank file.` : undefined,
      ),
    );
  }
  return checks;
}

// ---------------------------------------------------------------------------
// (4) and (5): a month's remittances
// ---------------------------------------------------------------------------

export interface MonthPayslipTotals {
  sssCents: bigint; // employee + employer + EC
  philhealthCents: bigint; // employee + employer
  pagibigCents: bigint; // employee + employer
  withholdingTaxCents: bigint;
}

export const sssR3Check = (reportTotal: bigint, m: MonthPayslipTotals) =>
  crossFoot("Q4-4a", "SSS R-3 total equals the month's payslip SSS contributions", m.sssCents, reportTotal);
export const philhealthRf1Check = (reportTotal: bigint, m: MonthPayslipTotals) =>
  crossFoot("Q4-4b", "PhilHealth RF-1 total equals the month's payslip PhilHealth contributions", m.philhealthCents, reportTotal);
export const pagibigMcrfCheck = (reportTotal: bigint, m: MonthPayslipTotals) =>
  crossFoot("Q4-4c", "Pag-IBIG MCRF total equals the month's payslip Pag-IBIG contributions", m.pagibigCents, reportTotal);
export const bir1601cCheck = (reportWithholding: bigint, m: MonthPayslipTotals) =>
  crossFoot("Q4-5", "BIR 1601-C tax withheld equals the month's payslip withholding", m.withholdingTaxCents, reportWithholding);

// ---------------------------------------------------------------------------
// (6): the year's 2316s and the alphalist
// ---------------------------------------------------------------------------

export interface YearFigures {
  grossCents: bigint;
  taxableCents: bigint;
  withholdingTaxCents: bigint;
}

/**
 * Each 2316 against that employee's payslips for the year. `payslips` holds
 * what the payslips (and any opening for this employer) add up to, by
 * employee; `certificates` what each 2316 says (Items 19, 21 and 25A).
 */
export function bir2316Checks(
  certificates: Map<string, YearFigures>,
  payslips: Map<string, YearFigures>,
): CrossFootCheck[] {
  const sum = (m: Map<string, YearFigures>, k: keyof YearFigures) => [...m.values()].reduce((t, v) => t + v[k], 0n);
  const off = [...certificates.entries()].filter(([id, c]) => {
    const p = payslips.get(id);
    return !p || p.grossCents !== c.grossCents || p.taxableCents !== c.taxableCents || p.withholdingTaxCents !== c.withholdingTaxCents;
  });
  const missing = [...payslips.keys()].filter((id) => !certificates.has(id));
  const detail =
    off.length + missing.length > 0
      ? `${off.length} certificate(s) differ from their payslips; ${missing.length} employee(s) with payslips have no certificate.`
      : undefined;
  const all = off.length === 0 && missing.length === 0;
  return [
    { ...crossFoot("Q4-6a", "Each 2316: gross compensation equals the employee's payslips for the year", sum(payslips, "grossCents"), sum(certificates, "grossCents"), detail), ok: all && sum(payslips, "grossCents") === sum(certificates, "grossCents") },
    { ...crossFoot("Q4-6b", "Each 2316: taxable compensation equals the employee's payslips for the year", sum(payslips, "taxableCents"), sum(certificates, "taxableCents"), detail), ok: all && sum(payslips, "taxableCents") === sum(certificates, "taxableCents") },
    { ...crossFoot("Q4-6c", "Each 2316: tax withheld equals the employee's payslips for the year", sum(payslips, "withholdingTaxCents"), sum(certificates, "withholdingTaxCents"), detail), ok: all && sum(payslips, "withholdingTaxCents") === sum(certificates, "withholdingTaxCents") },
  ];
}

/** The alphalist's totals against all the 2316s. */
export function alphalistChecks(alphalist: YearFigures, certificates: YearFigures): CrossFootCheck[] {
  return [
    crossFoot("Q4-6d", "Alphalist gross compensation equals all the 2316s", certificates.grossCents, alphalist.grossCents),
    crossFoot("Q4-6e", "Alphalist taxable compensation equals all the 2316s", certificates.taxableCents, alphalist.taxableCents),
    crossFoot("Q4-6f", "Alphalist tax withheld equals all the 2316s", certificates.withholdingTaxCents, alphalist.withholdingTaxCents),
  ];
}
