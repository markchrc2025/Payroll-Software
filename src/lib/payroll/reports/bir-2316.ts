/**
 * BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld.
 *
 * Employers must furnish each employee on or before 31 January of the
 * following year (or on termination / last day of employment).  It
 * summarises annual compensation, non-taxable income, statutory
 * deductions, and total income tax withheld during the calendar year.
 *
 * BIR 2316 box mapping (simplified, TRAIN-era layout):
 *   Box 13  — Gross Compensation Income (from all runs)
 *   Box 21  — MWE-exempt / non-taxable basic (minimum-wage earners)
 *   Box 22  — 13th month pay & other benefits (up to ₱90,000 cap)
 *   Box 23  — Other non-taxable compensation (de minimis, etc.)
 *   Box 24  — SSS/PHIC/Pag-IBIG/HDMF mandatory EE contributions
 *   Box 25  — Gross Taxable Compensation Income
 *   Box 27  — Total amount of taxes withheld and remitted
 *
 * TIN (Taxpayer Identification Number) is not yet captured in the employee
 * master; the field will appear as `null` until a future employee-master
 * sub-phase adds it.
 *
 * Pure function — no DB access.
 */

import type { TaxClassification } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface Bir2316SheetInput {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  withholdingTaxCents: bigint;
}

export interface Bir2316EmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  sheets: Bir2316SheetInput[];
  /**
   * PAY-144: this company's pay to the employee earlier in the year, before
   * it used Sentire. It is this employer's compensation, so it is added to
   * every box; it is not a pay period.
   */
  priorPayrollOpening?: Bir2316SheetInput;
  /** PAY-144: a previous employer's 2316 for the same year (a transferee). */
  previousEmployer?: Bir2316PreviousEmployerInput | null;
}

export interface Bir2316PreviousEmployerInput {
  name: string;
  tin: string | null;
  taxableCompensationCents: bigint;
  withholdingTaxCents: bigint;
}

export interface Bir2316Input {
  year: number;
  tenantId: string;
  tenantName: string;
  employees: Bir2316EmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface Bir2316Certificate {
  year: number;
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /// Taxpayer Identification Number — null until captured in employee master.
  tin: null;
  taxClassification: TaxClassification;
  /** Number of finalized payroll sheets covering this employee in the year. */
  payPeriodCount: number;

  // ── Compensation (Box 13) ────────────────────────────────────────────────
  /** Sum of grossCompensationCents across all run types for the year. */
  totalGrossCompensationCents: string;

  // ── Non-taxable buckets ─────────────────────────────────────────────────
  /** Box 21 — MWE-exempt compensation and non-taxable basic amount. */
  totalMweAndNontaxableBasicCents: string;
  /** Box 22 — 13th month pay and other benefits (TRAIN ₱90,000 cap). */
  totalNontaxable13MonthAndBenefitsCents: string;
  /** Box 23 — Other non-taxable compensation (de minimis, etc.).
   *  This is nontaxableCompensationCents net of mandatory EE contributions
   *  (which are reported separately in Box 24). */
  totalOtherNontaxableCents: string;

  // ── Mandatory EE contributions (Box 24) ─────────────────────────────────
  totalSssEeCents: string;
  totalPhilhealthEeCents: string;
  totalPagibigEeCents: string;
  /** Convenience sum: SSS EE + PhilHealth EE + Pag-IBIG EE. */
  totalMandatoryEeCents: string;

  // ── Taxable income (Box 25) ──────────────────────────────────────────────
  /** Sum of grossTaxableIncomeCents across all runs. */
  totalGrossTaxableIncomeCents: string;

  // ── Withholding tax (Box 27) ─────────────────────────────────────────────
  /** Total income tax withheld and remitted for the year. */
  totalWithholdingTaxCents: string;

  // ── PAY-144: year-to-date openings ──────────────────────────────────────
  /** True when the totals above include pay before Sentire (same employer). */
  includesPriorPayrollOpening: boolean;
  /** A previous employer's figures for the year, or null. */
  previousEmployer: {
    name: string;
    tin: string | null;
    taxableCompensationCents: string;
    withholdingTaxCents: string;
  } | null;
  /** Taxable compensation from this employer plus the previous employer. */
  totalGrossTaxableAllEmployersCents: string;
  /** Tax withheld by this employer plus the previous employer. */
  totalWithholdingAllEmployersCents: string;
}

export interface Bir2316Report {
  year: number;
  tenantId: string;
  tenantName: string;
  /** Number of employees with at least one finalized sheet in the year. */
  employeeCount: number;
  /** Per-employee certificates, sorted by lastName then firstName. */
  certificates: Bir2316Certificate[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

export function buildBir2316Report(input: Bir2316Input): Bir2316Report {
  const { year, tenantId, tenantName, employees } = input;

  const certificates: Bir2316Certificate[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0 && !emp.priorPayrollOpening) continue;

    let totalGross = 0n;
    let totalMweBasic = 0n;
    let totalNt13Month = 0n;
    let totalNtComp = 0n;
    let totalSss = 0n;
    let totalPhic = 0n;
    let totalPagibig = 0n;
    let totalTaxable = 0n;
    let totalWht = 0n;

    const rows = emp.priorPayrollOpening
      ? [...emp.sheets, emp.priorPayrollOpening]
      : emp.sheets;
    for (const s of rows) {
      totalGross += s.grossCompensationCents;
      totalMweBasic += s.mweExemptCompensationCents + s.nontaxableBasicCents;
      totalNt13Month += s.nontaxable13MonthAndBenefitsCents;
      totalNtComp += s.nontaxableCompensationCents;
      totalSss += s.sssEeCents;
      totalPhic += s.philhealthEeCents;
      totalPagibig += s.pagibigEeCents;
      totalTaxable += s.grossTaxableIncomeCents;
      totalWht += s.withholdingTaxCents;
    }

    // Box 23: nontaxableCompensation already includes mandatory EE contribs
    // (they were added to the non-taxable bucket inside the engine).  Remove
    // them so Box 23 shows only "other" non-taxable items (de minimis, etc.)
    // and Box 24 shows the contributions separately.
    const mandatoryEe = totalSss + totalPhic + totalPagibig;
    const prev = emp.previousEmployer ?? null;
    const otherNontaxable =
      totalNtComp > mandatoryEe ? totalNtComp - mandatoryEe : 0n;

    certificates.push({
      year,
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
      totalMweAndNontaxableBasicCents: totalMweBasic.toString(),
      totalNontaxable13MonthAndBenefitsCents: totalNt13Month.toString(),
      totalOtherNontaxableCents: otherNontaxable.toString(),
      totalSssEeCents: totalSss.toString(),
      totalPhilhealthEeCents: totalPhic.toString(),
      totalPagibigEeCents: totalPagibig.toString(),
      totalMandatoryEeCents: mandatoryEe.toString(),
      totalGrossTaxableIncomeCents: totalTaxable.toString(),
      totalWithholdingTaxCents: totalWht.toString(),
      includesPriorPayrollOpening: !!emp.priorPayrollOpening,
      previousEmployer: prev
        ? {
            name: prev.name,
            tin: prev.tin,
            taxableCompensationCents: prev.taxableCompensationCents.toString(),
            withholdingTaxCents: prev.withholdingTaxCents.toString(),
          }
        : null,
      totalGrossTaxableAllEmployersCents: (totalTaxable + (prev?.taxableCompensationCents ?? 0n)).toString(),
      totalWithholdingAllEmployersCents: (totalWht + (prev?.withholdingTaxCents ?? 0n)).toString(),
    });
  }

  certificates.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });

  return {
    year,
    tenantId,
    tenantName,
    employeeCount: certificates.length,
    certificates,
  };
}
