/**
 * BIR Annual Alphalist of Employees
 * (RR 1-2014 Annex B-1: Regular Employees; Annex B-2: MWE Schedule)
 *
 * The Alphalist is the employer's annual filing that lists every employee who
 * received compensation during the calendar year, with their income, benefits,
 * deductions, and withholding tax data.  It is filed electronically via the
 * BIR's Substituted Filing System (SRS/alphalist DAT file) on or before
 * March 1 of the following year.
 *
 * Two schedules:
 *   Annex B-1 — All employees (regular + MWE, one row each)
 *   Annex B-2 — MWE-only sub-schedule listing the MWE-exempt income
 *
 * The DAT file format is a pipe-delimited text file per BIR's electronic
 * submission specification.
 *
 * Input shape intentionally mirrors BIR 2316 inputs (same DB query).
 *
 * Pure function — no DB access.
 */
import type { TaxClassification } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input shape (identical to bir-2316.ts, re-exported for convenience)
// ---------------------------------------------------------------------------

export interface AlphalistSheetInput {
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
  /** Flag: was the employee determined to be MWE for this period? */
  isMwe: boolean;
}

export interface AlphalistEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  sheets: AlphalistSheetInput[];
}

export interface AlphalistInput {
  year: number;
  tenantId: string;
  tenantName: string;
  employees: AlphalistEmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** One row in Annex B-1 (all employees). */
export interface AlphalistEntry {
  /** 1-based sequence number. */
  seqNo: number;
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /** TIN — null until captured in employee master. */
  tin: null;
  taxClassification: TaxClassification;
  /** True if the employee was classified as MWE in any pay period this year. */
  isMwe: boolean;
  payPeriodCount: number;

  // Compensation data (pesos as strings to avoid BigInt serialization issues)
  totalGrossCompensationCents: string;
  totalMweAndNontaxableBasicCents: string;
  totalNontaxable13MonthAndBenefitsCents: string;
  /** Other non-taxable compensation (ex mandatory EE contributions). */
  totalOtherNontaxableCents: string;
  totalSssEeCents: string;
  totalPhilhealthEeCents: string;
  totalPagibigEeCents: string;
  totalMandatoryEeCents: string;
  totalGrossTaxableIncomeCents: string;
  totalWithholdingTaxCents: string;
}

/** One row in Annex B-2 (MWE sub-schedule). */
export interface AlphalistMweEntry {
  seqNo: number;
  employeeId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  tin: null;
  totalMweExemptCents: string;
  totalNontaxableBasicCents: string;
  totalNontaxable13MonthAndBenefitsCents: string;
}

export interface AlphalistReport {
  year: number;
  tenantId: string;
  tenantName: string;
  /** All employees including MWE — sorted by lastName, firstName. */
  entries: AlphalistEntry[];
  /** MWE-only sub-schedule (Annex B-2). */
  mweEntries: AlphalistMweEntry[];
  // Totals
  employeeCount: number;
  mweCount: number;
  totalGrossCompensationCents: string;
  totalGrossTaxableIncomeCents: string;
  totalWithholdingTaxCents: string;
  totalMandatoryEeCents: string;
  /**
   * DAT file content for BIR SRS/Alphalist electronic submission.
   * Format: pipe-delimited, one employee per line.
   * Header line: "ALPHALIST|<year>|<tenantName>|<count>"
   * Detail: "<seqNo>|<tin>|<lastName>|<firstName>|<MI>|<suffix>|<taxClass>|<gross>|<mweExempt>|<nt13th>|<otherNt>|<sss>|<phic>|<hdmf>|<taxable>|<wht>|<isMwe>"
   */
  datFileContent: string;
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

/** Format bigint centavos as pesos with 2 decimal places. */
function pesosStr(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const pesos = abs / 100n;
  const c = abs % 100n;
  return `${pesos}.${String(c).padStart(2, "0")}`;
}

export function buildAlphalistReport(input: AlphalistInput): AlphalistReport {
  const { year, tenantId, tenantName, employees } = input;

  let grandGross = 0n;
  let grandTaxable = 0n;
  let grandWht = 0n;
  let grandMandatory = 0n;
  let mweCount = 0;

  const entries: AlphalistEntry[] = [];
  const mweEntries: AlphalistMweEntry[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue;

    let totalGross = 0n;
    let totalMweExempt = 0n;
    let totalNtBasic = 0n;
    let totalNt13 = 0n;
    let totalNtComp = 0n;
    let totalSss = 0n;
    let totalPhic = 0n;
    let totalHdmf = 0n;
    let totalTaxable = 0n;
    let totalWht = 0n;
    let anyMwe = false;

    for (const s of emp.sheets) {
      totalGross += s.grossCompensationCents;
      totalMweExempt += s.mweExemptCompensationCents;
      totalNtBasic += s.nontaxableBasicCents;
      totalNt13 += s.nontaxable13MonthAndBenefitsCents;
      totalNtComp += s.nontaxableCompensationCents;
      totalSss += s.sssEeCents;
      totalPhic += s.philhealthEeCents;
      totalHdmf += s.pagibigEeCents;
      totalTaxable += s.grossTaxableIncomeCents;
      totalWht += s.withholdingTaxCents;
      if (s.isMwe) anyMwe = true;
    }

    const totalMandatory = totalSss + totalPhic + totalHdmf;
    // "Other non-taxable" = nontaxableComp minus mandatory contribs
    // (mandatory contribs are reported separately per BIR Annex B-1)
    const otherNt =
      totalNtComp > totalMandatory ? totalNtComp - totalMandatory : 0n;

    grandGross += totalGross;
    grandTaxable += totalTaxable;
    grandWht += totalWht;
    grandMandatory += totalMandatory;

    const mweAndNtBasic = totalMweExempt + totalNtBasic;

    entries.push({
      seqNo: 0,
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      tin: null,
      taxClassification: emp.taxClassification,
      isMwe: anyMwe,
      payPeriodCount: emp.sheets.length,
      totalGrossCompensationCents: totalGross.toString(),
      totalMweAndNontaxableBasicCents: mweAndNtBasic.toString(),
      totalNontaxable13MonthAndBenefitsCents: totalNt13.toString(),
      totalOtherNontaxableCents: otherNt.toString(),
      totalSssEeCents: totalSss.toString(),
      totalPhilhealthEeCents: totalPhic.toString(),
      totalPagibigEeCents: totalHdmf.toString(),
      totalMandatoryEeCents: totalMandatory.toString(),
      totalGrossTaxableIncomeCents: totalTaxable.toString(),
      totalWithholdingTaxCents: totalWht.toString(),
    });

    if (anyMwe) {
      mweCount += 1;
      mweEntries.push({
        seqNo: 0,
        employeeId: emp.employeeId,
        lastName: emp.lastName,
        firstName: emp.firstName,
        middleName: emp.middleName,
        suffix: emp.suffix,
        tin: null,
        totalMweExemptCents: totalMweExempt.toString(),
        totalNontaxableBasicCents: totalNtBasic.toString(),
        totalNontaxable13MonthAndBenefitsCents: totalNt13.toString(),
      });
    }
  }

  // Sort and assign sequence numbers
  entries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });
  entries.forEach((e, idx) => { e.seqNo = idx + 1; });

  mweEntries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });
  mweEntries.forEach((e, idx) => { e.seqNo = idx + 1; });

  // --- Build DAT file ---
  const lines: string[] = [
    `ALPHALIST|${year}|${tenantName}|${entries.length}`,
  ];
  for (const e of entries) {
    const mi = e.middleName ? e.middleName.charAt(0).toUpperCase() : "";
    lines.push(
      [
        e.seqNo,
        "",                    // TIN — deferred
        e.lastName,
        e.firstName,
        mi,
        e.suffix ?? "",
        e.taxClassification,
        pesosStr(BigInt(e.totalGrossCompensationCents)),
        pesosStr(BigInt(e.totalMweAndNontaxableBasicCents)),
        pesosStr(BigInt(e.totalNontaxable13MonthAndBenefitsCents)),
        pesosStr(BigInt(e.totalOtherNontaxableCents)),
        pesosStr(BigInt(e.totalSssEeCents)),
        pesosStr(BigInt(e.totalPhilhealthEeCents)),
        pesosStr(BigInt(e.totalPagibigEeCents)),
        pesosStr(BigInt(e.totalGrossTaxableIncomeCents)),
        pesosStr(BigInt(e.totalWithholdingTaxCents)),
        e.isMwe ? "Y" : "N",
      ].join("|"),
    );
  }
  const datFileContent = lines.join("\n");

  return {
    year,
    tenantId,
    tenantName,
    entries,
    mweEntries,
    employeeCount: entries.length,
    mweCount,
    totalGrossCompensationCents: grandGross.toString(),
    totalGrossTaxableIncomeCents: grandTaxable.toString(),
    totalWithholdingTaxCents: grandWht.toString(),
    totalMandatoryEeCents: grandMandatory.toString(),
    datFileContent,
  };
}
