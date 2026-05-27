/**
 * Pag-IBIG MCRF — Monthly Contribution Remittance Form
 * (Home Development Mutual Fund).
 *
 * Employers remit member and employer contributions monthly via MCRF,
 * listing each employee's Monthly Fund Salary (MFS), EE contribution,
 * and ER contribution.  Total = EE + ER.
 *
 * Pag-IBIG MID number is deferred — stored encrypted in StatutoryId.
 *
 * Pure function — no DB access.
 */

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface PagibigMcrfSheetInput {
  pagibigEeCents: bigint;
  pagibigErCents: bigint;
  /** Monthly Fund Salary (MFS cap) in centavos; from statutoryBreakdown.bases.pagibigMfsCents. */
  pagibigMfsCents: bigint;
}

export interface PagibigMcrfEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  sheets: PagibigMcrfSheetInput[];
}

export interface PagibigMcrfInput {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: PagibigMcrfEmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface PagibigMcrfEntry {
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /** Pag-IBIG MID number — null until captured/decrypted. */
  pagibigNumber: null;
  /** Monthly Fund Salary used for contribution computation (centavos as string). */
  pagibigMfsCents: string;
  pagibigEeCents: string;
  pagibigErCents: string;
  /** Total contribution = EE + ER. */
  totalContributionCents: string;
  payPeriodCount: number;
}

export interface PagibigMcrfReport {
  year: number;
  month: number;
  tenantId: string;
  tenantName: string;
  periodFrom: string;
  periodTo: string;
  employeeCount: number;
  totalPagibigEeCents: string;
  totalPagibigErCents: string;
  /** Grand total contribution = all EE + ER. */
  totalContributionCents: string;
  entries: PagibigMcrfEntry[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildPagibigMcrfReport(
  input: PagibigMcrfInput,
): PagibigMcrfReport {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  let grandEe = 0n;
  let grandEr = 0n;
  let employeeCount = 0;

  const entries: PagibigMcrfEntry[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue;

    let totalEe = 0n;
    let totalEr = 0n;
    let maxMfs = 0n;

    for (const s of emp.sheets) {
      totalEe += s.pagibigEeCents;
      totalEr += s.pagibigErCents;
      if (s.pagibigMfsCents > maxMfs) maxMfs = s.pagibigMfsCents;
    }

    grandEe += totalEe;
    grandEr += totalEr;
    employeeCount += 1;

    entries.push({
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      pagibigNumber: null,
      pagibigMfsCents: maxMfs.toString(),
      pagibigEeCents: totalEe.toString(),
      pagibigErCents: totalEr.toString(),
      totalContributionCents: (totalEe + totalEr).toString(),
      payPeriodCount: emp.sheets.length,
    });
  }

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
    employeeCount,
    totalPagibigEeCents: grandEe.toString(),
    totalPagibigErCents: grandEr.toString(),
    totalContributionCents: (grandEe + grandEr).toString(),
    entries,
  };
}
