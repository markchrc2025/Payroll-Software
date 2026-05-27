/**
 * SSS Form R-1A — Monthly Report of Employee Contributions
 * (Contributions Collection List).
 *
 * Employers must submit R-1A alongside premium remittances each month,
 * listing every covered employee's Monthly Salary Credit (MSC), and the
 * resulting Employee Share (EE), Employer Share (ER), and Employee
 * Compensation (EC / WISP) amounts.
 *
 * This module produces structured data from FINALIZED PayrollSheets whose
 * PayrollBook `periodEnd` falls in the requested calendar month.  SSS number
 * is deferred — stored encrypted in StatutoryId and not surfaced here until
 * a decryption-key-management layer is implemented.
 *
 * Pure function — no DB access.
 */

// ---------------------------------------------------------------------------
// Input shape (provided by route layer)
// ---------------------------------------------------------------------------

export interface SssR1aSheetInput {
  sssEeCents: bigint;
  sssErCents: bigint;
  sssEcCents: bigint;
  /** Monthly Salary Credit in centavos; from statutoryBreakdown.bases.sssMscCents. */
  sssMscCents: bigint;
}

export interface SssR1aEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  sheets: SssR1aSheetInput[];
}

export interface SssR1aInput {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: SssR1aEmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface SssR1aEntry {
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /** SSS membership number — null until captured/decrypted. */
  sssNumber: null;
  /** Monthly Salary Credit (max across pay periods, centavos as string). */
  sssMscCents: string;
  /** Employee share (EE regular + MPF). */
  sssEeCents: string;
  /** Employer share (ER regular + MPF). */
  sssErCents: string;
  /** Employee Compensation / WISP. */
  sssEcCents: string;
  /** Total remittance = EE + ER + EC. */
  totalSssContributionCents: string;
  payPeriodCount: number;
}

export interface SssR1aReport {
  year: number;
  month: number;
  tenantId: string;
  tenantName: string;
  /** ISO date of the first day of the month ("YYYY-MM-01"). */
  periodFrom: string;
  /** ISO date of the last day of the month. */
  periodTo: string;
  employeeCount: number;
  totalSssEeCents: string;
  totalSssErCents: string;
  totalSssEcCents: string;
  /** Grand total remittance = all EE + ER + EC. */
  totalSssContributionCents: string;
  /** Per-employee rows sorted by lastName, firstName. */
  entries: SssR1aEntry[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildSssR1aReport(input: SssR1aInput): SssR1aReport {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  let grandEe = 0n;
  let grandEr = 0n;
  let grandEc = 0n;
  let employeeCount = 0;

  const entries: SssR1aEntry[] = [];

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
    employeeCount += 1;

    entries.push({
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      sssNumber: null,
      sssMscCents: maxMsc.toString(),
      sssEeCents: totalEe.toString(),
      sssErCents: totalEr.toString(),
      sssEcCents: totalEc.toString(),
      totalSssContributionCents: (totalEe + totalEr + totalEc).toString(),
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
    totalSssEeCents: grandEe.toString(),
    totalSssErCents: grandEr.toString(),
    totalSssEcCents: grandEc.toString(),
    totalSssContributionCents: (grandEe + grandEr + grandEc).toString(),
    entries,
  };
}
