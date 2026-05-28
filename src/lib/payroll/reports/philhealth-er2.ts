/**
 * PhilHealth ER2 — Premium Contribution Payment Return
 * (Employer's Contribution for Organized Members).
 *
 * ER2 is the employer's monthly premium contribution return listing each
 * covered employee, their basic monthly salary (BMS), and EE/ER premium
 * shares.  It accompanies the monthly remittance to PhilHealth and is
 * distinct from RF1 (the Employer's Remittance Report filed online).
 *
 * In practice:
 *   - RF1 = Online remittance report (digital filing via PhilHealth e-services)
 *   - ER2 = Physical/legacy Premium Contribution Payment Return form
 *
 * Both ER2 and RF1 report the same underlying data; ER2 is structured for
 * the "Organized" (employer-based) collection scheme.  This module produces
 * the ER2 structured JSON alongside a pipe-delimited text format for
 * electronic submission.
 *
 * PhilHealth number is stored encrypted in StatutoryId and is deferred here.
 *
 * Pure function — no DB access.
 */

// ---------------------------------------------------------------------------
// Input shape (provided by route layer)
// ---------------------------------------------------------------------------

export interface PhilhealthEr2SheetInput {
  philhealthEeCents: bigint;
  philhealthErCents: bigint;
  /** Basic Monthly Salary (MSC) in centavos; from statutoryBreakdown.bases.philHealthMscCents. */
  philhealthMscCents: bigint;
}

export interface PhilhealthEr2EmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  sheets: PhilhealthEr2SheetInput[];
}

export interface PhilhealthEr2Input {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: PhilhealthEr2EmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface PhilhealthEr2Entry {
  /** 1-based sequence number. */
  seqNo: number;
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /** PhilHealth number — null until captured/decrypted. */
  philhealthNumber: null;
  /** Basic Monthly Salary (max MSC across pay periods, centavos as string). */
  philhealthMscCents: string;
  /** Employee premium share (total across all periods in month). */
  philhealthEeCents: string;
  /** Employer premium share (total across all periods in month). */
  philhealthErCents: string;
  /** Total premium = EE + ER. */
  totalPremiumCents: string;
  payPeriodCount: number;
}

export interface PhilhealthEr2Report {
  year: number;
  month: number;
  /** "YYYY-MM" applicable period string. */
  applicablePeriod: string;
  tenantId: string;
  tenantName: string;
  periodFrom: string;
  periodTo: string;
  employeeCount: number;
  totalPhilhealthEeCents: string;
  totalPhilhealthErCents: string;
  /** Grand total premium = all EE + ER. */
  totalPremiumCents: string;
  /** Per-employee rows sorted by lastName, firstName. */
  entries: PhilhealthEr2Entry[];
  /**
   * Pipe-delimited text content for electronic submission.
   * Header: "ER2|<employerPhN>|<yyyy-MM>|<count>|<totalEE>|<totalER>"
   * Detail: "<seqNo>|<phNo>|<lastName>|<firstName>|<MI>|<msc>|<ee>|<er>"
   */
  submissionText: string;
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Format centavos as a two-decimal peso string for PhilHealth. */
function pesoStr(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const pesos = abs / 100n;
  const centsPart = abs % 100n;
  return `${pesos}.${String(centsPart).padStart(2, "0")}`;
}

export function buildPhilhealthEr2Report(input: PhilhealthEr2Input): PhilhealthEr2Report {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  const applicablePeriod = `${year}-${mm}`;

  let grandEe = 0n;
  let grandEr = 0n;
  const entries: PhilhealthEr2Entry[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue;

    let totalEe = 0n;
    let totalEr = 0n;
    let maxMsc = 0n;

    for (const s of emp.sheets) {
      totalEe += s.philhealthEeCents;
      totalEr += s.philhealthErCents;
      if (s.philhealthMscCents > maxMsc) maxMsc = s.philhealthMscCents;
    }

    grandEe += totalEe;
    grandEr += totalEr;

    entries.push({
      seqNo: 0, // assigned after sort
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      philhealthNumber: null,
      philhealthMscCents: maxMsc.toString(),
      philhealthEeCents: totalEe.toString(),
      philhealthErCents: totalEr.toString(),
      totalPremiumCents: (totalEe + totalEr).toString(),
      payPeriodCount: emp.sheets.length,
    });
  }

  entries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });
  entries.forEach((e, idx) => { e.seqNo = idx + 1; });

  const grandTotal = grandEe + grandEr;

  // --- Submission text ---
  const lines: string[] = [
    `ER2||${applicablePeriod}|${entries.length}|${pesoStr(grandEe)}|${pesoStr(grandEr)}`,
  ];
  for (const e of entries) {
    const mi = e.middleName ? e.middleName.charAt(0).toUpperCase() : "";
    lines.push(
      [
        e.seqNo,
        "", // philhealthNumber — deferred
        e.lastName,
        e.firstName,
        mi,
        pesoStr(BigInt(e.philhealthMscCents)),
        pesoStr(BigInt(e.philhealthEeCents)),
        pesoStr(BigInt(e.philhealthErCents)),
      ].join("|"),
    );
  }
  const submissionText = lines.join("\n");

  return {
    year,
    month,
    applicablePeriod,
    tenantId,
    tenantName,
    periodFrom,
    periodTo,
    employeeCount: entries.length,
    totalPhilhealthEeCents: grandEe.toString(),
    totalPhilhealthErCents: grandEr.toString(),
    totalPremiumCents: grandTotal.toString(),
    entries,
    submissionText,
  };
}
