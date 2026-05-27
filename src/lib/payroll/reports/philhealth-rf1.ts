/**
 * PhilHealth RF1 — Employer's Remittance Report
 * (Employee Members' Contributions).
 *
 * Employers file RF1 monthly alongside premium remittances, listing each
 * employee's monthly basic salary (MSC), EE premium share, and ER premium
 * share.  Total premium = EE + ER.
 *
 * PhilHealth number is deferred — stored encrypted in StatutoryId.
 *
 * Pure function — no DB access.
 */

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface PhilhealthRf1SheetInput {
  philhealthEeCents: bigint;
  philhealthErCents: bigint;
  /** Monthly Basic Salary (MSC) in centavos; from statutoryBreakdown.bases.philHealthMscCents. */
  philhealthMscCents: bigint;
}

export interface PhilhealthRf1EmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  sheets: PhilhealthRf1SheetInput[];
}

export interface PhilhealthRf1Input {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  employees: PhilhealthRf1EmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface PhilhealthRf1Entry {
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /** PhilHealth number — null until captured/decrypted. */
  philhealthNumber: null;
  /** Monthly Basic Salary used for premium computation (centavos as string). */
  philhealthMscCents: string;
  philhealthEeCents: string;
  philhealthErCents: string;
  /** Total premium = EE + ER. */
  totalPremiumCents: string;
  payPeriodCount: number;
}

export interface PhilhealthRf1Report {
  year: number;
  month: number;
  tenantId: string;
  tenantName: string;
  periodFrom: string;
  periodTo: string;
  employeeCount: number;
  totalPhilhealthEeCents: string;
  totalPhilhealthErCents: string;
  /** Grand total premium = all EE + ER. */
  totalPremiumCents: string;
  entries: PhilhealthRf1Entry[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildPhilhealthRf1Report(
  input: PhilhealthRf1Input,
): PhilhealthRf1Report {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  let grandEe = 0n;
  let grandEr = 0n;
  let employeeCount = 0;

  const entries: PhilhealthRf1Entry[] = [];

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
    employeeCount += 1;

    entries.push({
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

  return {
    year,
    month,
    tenantId,
    tenantName,
    periodFrom,
    periodTo,
    employeeCount,
    totalPhilhealthEeCents: grandEe.toString(),
    totalPhilhealthErCents: grandEr.toString(),
    totalPremiumCents: (grandEe + grandEr).toString(),
    entries,
  };
}
