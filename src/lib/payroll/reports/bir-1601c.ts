/**
 * BIR Form 1601-C — Monthly Remittance Return of Income Taxes Withheld on
 * Compensation.
 *
 * Employers must file and remit withheld compensation income tax monthly
 * (due 10th–15th of the following month, depending on industry group) via
 * BIR eFPS / eBIRForms.
 *
 * This module produces a structured data object aggregating the required
 * compensation and withholding tax figures from FINALIZED PayrollSheets
 * whose PayrollBook `periodEnd` falls within the requested calendar
 * month/year.  TIN is deferred — the Employee model does not yet store TIN;
 * the field will be `null` until captured in a future employee-master phase.
 *
 * Pure function — no DB access.  The route layer performs the query and
 * passes pre-loaded data here.
 */

import type { TaxClassification } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input shape (provided by route layer)
// ---------------------------------------------------------------------------

export interface Bir1601cSheetInput {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  withholdingTaxCents: bigint;
}

export interface Bir1601cEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  sheets: Bir1601cSheetInput[];
}

export interface Bir1601cInput {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: Bir1601cEmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface Bir1601cEntry {
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /// Taxpayer Identification Number — null until captured in employee master.
  tin: null;
  taxClassification: TaxClassification;
  payPeriodCount: number;
  /// Sum of grossCompensationCents across all sheets for the month.
  totalGrossCompensationCents: string;
  /// Sum of all non-taxable buckets (MWE-exempt + nontaxableBasic +
  /// nontaxableComp + 13th-month/benefits).
  totalNonTaxableCompensationCents: string;
  /// Sum of grossTaxableIncomeCents.
  totalTaxableCompensationCents: string;
  /// Sum of withholdingTaxCents — amount to remit for this employee.
  totalWithholdingTaxCents: string;
}

export interface Bir1601cReport {
  /** Calendar year. */
  year: number;
  /** Calendar month (1 = January … 12 = December). */
  month: number;
  tenantId: string;
  tenantName: string;
  /** ISO date of the first day of the remittance month, e.g. "2026-06-01". */
  periodFrom: string;
  /** ISO date of the last day of the remittance month, e.g. "2026-06-30". */
  periodTo: string;
  /** Total gross compensation across all employees. */
  totalGrossCompensationCents: string;
  /** Total non-taxable compensation across all employees. */
  totalNonTaxableCompensationCents: string;
  /** Total taxable compensation across all employees. */
  totalTaxableCompensationCents: string;
  /** Total withholding tax to remit — the headline figure for BIR 1601-C. */
  totalWithholdingTaxCents: string;
  /** Number of distinct employees who received compensation in the month. */
  payeeCount: number;
  /** Per-employee detail rows (sorted by lastName, firstName). */
  entries: Bir1601cEntry[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildBir1601cReport(input: Bir1601cInput): Bir1601cReport {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  let grandGross = 0n;
  let grandNonTaxable = 0n;
  let grandTaxable = 0n;
  let grandWht = 0n;
  let payeeCount = 0;

  const entries: Bir1601cEntry[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue; // no sheets this month → skip

    let totalGross = 0n;
    let totalNonTaxable = 0n;
    let totalTaxable = 0n;
    let totalWht = 0n;

    for (const s of emp.sheets) {
      totalGross += s.grossCompensationCents;
      totalNonTaxable +=
        s.mweExemptCompensationCents +
        s.nontaxableBasicCents +
        s.nontaxableCompensationCents +
        s.nontaxable13MonthAndBenefitsCents;
      totalTaxable += s.grossTaxableIncomeCents;
      totalWht += s.withholdingTaxCents;
    }

    grandGross += totalGross;
    grandNonTaxable += totalNonTaxable;
    grandTaxable += totalTaxable;
    grandWht += totalWht;
    payeeCount += 1;

    entries.push({
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      tin: null,
      taxClassification: emp.taxClassification,
      payPeriodCount: emp.sheets.length,
      totalGrossCompensationCents: totalGross.toString(),
      totalNonTaxableCompensationCents: totalNonTaxable.toString(),
      totalTaxableCompensationCents: totalTaxable.toString(),
      totalWithholdingTaxCents: totalWht.toString(),
    });
  }

  // Sort by lastName then firstName (ascending).
  entries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });

  return {
    year,
    month,
    tenantId,
    tenantName,
    periodFrom,
    periodTo,
    totalGrossCompensationCents: grandGross.toString(),
    totalNonTaxableCompensationCents: grandNonTaxable.toString(),
    totalTaxableCompensationCents: grandTaxable.toString(),
    totalWithholdingTaxCents: grandWht.toString(),
    payeeCount,
    entries,
  };
}
