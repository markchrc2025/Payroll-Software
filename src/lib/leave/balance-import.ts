/**
 * PAY-145: opening leave balances by CSV (HR.my review D8, Mark chose A on
 * 16 Nov 2026: leave balances before beta, built with the year-to-date
 * openings of PAY-144).
 *
 * Columns (header row, case-insensitive), in template order:
 *
 *   employee_number, leave_type_code, year, opening_balance
 *
 * opening_balance is in the leave type's own unit (days or hours), 0 or more,
 * at most four decimals, the same precision LeaveBalance keeps. A row sets
 * the opening balance of that employee, leave type and year; earned, used,
 * forfeited and cashed-out units are never touched.
 */

export const LEAVE_BALANCE_CSV_COLUMNS = ["employee_number", "leave_type_code", "year", "opening_balance"] as const;

export interface LeaveBalanceRowInput {
  employeeNumber: string;
  leaveTypeCode: string;
  year: number;
  /** Decimal as text, exactly as stored (e.g. "7.5", "12.2500"). */
  openingBalance: string;
}

export const MAX_OPENING_BALANCE = 9999;

/** "7", "7.5", "1,234.25" to "7", "7.5", "1234.25"; null when not a valid balance. */
export function parseBalance(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  if (Number(s) > MAX_OPENING_BALANCE) return null;
  return s.replace(/^0+(?=\d)/, "");
}

export function csvRowToLeaveBalance(
  row: Record<string, string>,
  thisYear: number,
): { ok: true; input: LeaveBalanceRowInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const employeeNumber = (row.employee_number ?? "").trim();
  const leaveTypeCode = (row.leave_type_code ?? "").trim().toUpperCase();
  const yearText = (row.year ?? "").trim();
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
  if (!employeeNumber) errors.push("employee_number is empty");
  if (!leaveTypeCode) errors.push("leave_type_code is empty");
  if (!Number.isInteger(year) || year < 2020 || year > thisYear + 1) errors.push(`year must be a year from 2020 to ${thisYear + 1}`);
  const openingBalance = parseBalance(row.opening_balance);
  if (openingBalance === null) {
    errors.push(`opening_balance "${row.opening_balance ?? ""}" must be a number from 0 to ${MAX_OPENING_BALANCE} with at most 4 decimals`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, input: { employeeNumber, leaveTypeCode, year, openingBalance: openingBalance! } };
}

export function leaveBalanceTemplate(year: number, rows: { employeeNumber: string; leaveTypeCode: string; openingBalance?: string }[] = []): string {
  const lines = [LEAVE_BALANCE_CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push([r.employeeNumber, r.leaveTypeCode, year, r.openingBalance ?? "0"].join(","));
  return `${lines.join("\n")}\n`;
}
