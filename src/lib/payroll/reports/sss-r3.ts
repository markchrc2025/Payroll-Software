/**
 * SSS Form R-3 — Monthly Collection List
 * (Employer's Contribution Collection Register).
 *
 * R-3 is the employer's monthly collection list that accompanies premium
 * remittances.  It lists each covered employee, their Monthly Salary Credit
 * (MSC), and the resulting EE, ER, and EC/WISP contribution amounts for the
 * remittance month.  In the SSS Electronic Collection System (ECS), R-3 is
 * submitted as a pipe-delimited text file alongside the payment.
 *
 * Difference from R-1A: R-1A is the contribution schedule (all employees
 * for the month); R-3 is the collection list that accompanies a specific
 * payment — it can cover one or more pay periods within the month and is
 * linked to a single remittance transaction.  For SaaS purposes we generate
 * one R-3 per calendar month (matching R-1A) so the client can attach it to
 * their monthly remittance.
 *
 * SSS ECS R-3 text format (pipe-delimited, one line per employee):
 *   Line 1  — Header: "R3|<employerSSS>|<yyyyMM>|<recordCount>|<totalEE>|<totalER>|<totalEC>"
 *   Lines 2+ — Detail: "<seqNo>|<employeeSSS>|<lastName>|<firstName>|<MI>|<msc>|<eeShare>|<erShare>|<ec>"
 *
 * SSS numbers are stored encrypted and are emitted as empty strings until a
 * decryption layer is implemented; the structured JSON always has them as
 * null.
 *
 * Pure function — no DB access.
 */

// ---------------------------------------------------------------------------
// Input shape (provided by route layer)
// ---------------------------------------------------------------------------

export interface SssR3SheetInput {
  sssEeCents: bigint;
  sssErCents: bigint;
  sssEcCents: bigint;
  /** Monthly Salary Credit in centavos; from statutoryBreakdown.bases.sssMscCents. */
  sssMscCents: bigint;
}

export interface SssR3EmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  sheets: SssR3SheetInput[];
}

export interface SssR3Input {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: SssR3EmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface SssR3Entry {
  /** 1-based sequence number in the collection list. */
  seqNo: number;
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  /** Middle initial (first character of middleName). */
  middleInitial: string | null;
  suffix: string | null;
  /** SSS membership number — null until captured/decrypted. */
  sssNumber: null;
  /** Monthly Salary Credit used for this remittance (max across pay periods). */
  sssMscCents: string;
  sssEeCents: string;
  sssErCents: string;
  sssEcCents: string;
  /** EE + ER + EC for this employee. */
  totalCents: string;
  payPeriodCount: number;
}

export interface SssR3Report {
  year: number;
  month: number;
  /** "YYYYMM" remittance period string. */
  remittancePeriod: string;
  tenantId: string;
  tenantName: string;
  periodFrom: string;
  periodTo: string;
  employeeCount: number;
  totalSssEeCents: string;
  totalSssErCents: string;
  totalSssEcCents: string;
  totalSssContributionCents: string;
  /** Per-employee rows sorted by lastName, firstName; seqNo is 1-based index. */
  entries: SssR3Entry[];
  /**
   * ECS-compatible pipe-delimited text content.
   * Clients can write this to a `.txt` file for SSSNet/ECS upload.
   */
  ecsText: string;
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Format centavos as a whole-peso string (SSS ECS uses pesos, no decimal). */
function pesoStr(cents: bigint): string {
  return (cents / 100n).toString();
}

export function buildSssR3Report(input: SssR3Input): SssR3Report {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  const remittancePeriod = `${year}${mm}`;

  let grandEe = 0n;
  let grandEr = 0n;
  let grandEc = 0n;
  let seqNo = 0;

  const entries: SssR3Entry[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue;

    let totalEe = 0n;
    let totalEr = 0n;
    let totalEc = 0n;
    let maxMsc = 0n;

    for (const s of emp.sheets) {
      totalEe += s.sssEeCents;
      totalEr += s.sssErCents;
      totalEc += s.sssEcCents;
      if (s.sssMscCents > maxMsc) maxMsc = s.sssMscCents;
    }

    grandEe += totalEe;
    grandEr += totalEr;
    grandEc += totalEc;
    seqNo += 1;

    const mi = emp.middleName ? emp.middleName.charAt(0).toUpperCase() : null;

    entries.push({
      seqNo,
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleInitial: mi,
      suffix: emp.suffix,
      sssNumber: null,
      sssMscCents: maxMsc.toString(),
      sssEeCents: totalEe.toString(),
      sssErCents: totalEr.toString(),
      sssEcCents: totalEc.toString(),
      totalCents: (totalEe + totalEr + totalEc).toString(),
      payPeriodCount: emp.sheets.length,
    });
  }

  entries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });

  // Re-number after sort
  entries.forEach((e, idx) => { e.seqNo = idx + 1; });

  const grandTotal = grandEe + grandEr + grandEc;

  // --- Build ECS text ---
  // Header: R3|<employerSSS>|<yyyyMM>|<count>|<totalEE>|<totalER>|<totalEC>
  const lines: string[] = [
    `R3||${remittancePeriod}|${entries.length}|${pesoStr(grandEe)}|${pesoStr(grandEr)}|${pesoStr(grandEc)}`,
  ];
  for (const e of entries) {
    // seq|sssNo|last|first|MI|msc|ee|er|ec
    lines.push(
      [
        e.seqNo,
        "", // sssNumber — deferred
        e.lastName,
        e.firstName,
        e.middleInitial ?? "",
        pesoStr(BigInt(e.sssMscCents)),
        pesoStr(BigInt(e.sssEeCents)),
        pesoStr(BigInt(e.sssErCents)),
        pesoStr(BigInt(e.sssEcCents)),
      ].join("|"),
    );
  }
  const ecsText = lines.join("\n");

  return {
    year,
    month,
    remittancePeriod,
    tenantId,
    tenantName,
    periodFrom,
    periodTo,
    employeeCount: entries.length,
    totalSssEeCents: grandEe.toString(),
    totalSssErCents: grandEr.toString(),
    totalSssEcCents: grandEc.toString(),
    totalSssContributionCents: grandTotal.toString(),
    entries,
    ecsText,
  };
}
