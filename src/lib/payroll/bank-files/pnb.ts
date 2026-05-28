/**
 * Phase H — PNB (Philippine National Bank) batch payroll credit file formatter.
 *
 * Format: tab-delimited ( \t ) text, CRLF line endings.
 * No header row; no trailer row.
 *
 * Columns (one row per employee):
 *   ACCTNO \t ACCTNAME \t AMOUNT \t EMPNO \t REMARKS
 *
 *   ACCTNO   — destination PNB account number (blank if missing)
 *   ACCTNAME — account holder name (max 50 chars; blank if missing)
 *   AMOUNT   — peso amount with 2 decimal places (e.g. "12345.67")
 *   EMPNO    — employee number (payroll reference, max 20 chars)
 *   REMARKS  — literal "PAYROLL CREDIT"
 *
 * A SUMMARY row is appended as the last row:
 *   TOTAL \t <count> \t <total_amount> \t \t
 */
import type { BankFileInput } from "./types";
import { formatPeso } from "./types";

export { type BankFileInput as PnbFileInput };

export function formatPnbFile(input: BankFileInput): string {
  const { rows } = input;
  const lines: string[] = [];

  let totalCents = 0n;
  for (const row of rows) {
    lines.push(
      [
        row.accountNumber ?? "",
        (row.accountName ?? "").substring(0, 50),
        formatPeso(row.netPayCents),
        row.employeeNumber.substring(0, 20),
        "PAYROLL CREDIT",
      ].join("\t"),
    );
    totalCents += row.netPayCents;
  }

  // Summary row
  lines.push(
    ["TOTAL", rows.length.toString(), formatPeso(totalCents), "", ""].join("\t"),
  );

  return lines.join("\r\n") + "\r\n";
}
