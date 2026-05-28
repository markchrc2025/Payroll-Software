/**
 * Phase H — BDO Unibank batch payroll credit file formatter.
 *
 * Format: pipe-delimited ( | ) text, CRLF line endings.
 *
 * HEADER (1 line):
 *   H|BATCHREF|MMDDYYYY|COMPANY_NAME|TOTAL_AMOUNT|RECORD_COUNT
 *
 *   BATCHREF   — batch reference string (max 20 chars)
 *   MMDDYYYY   — value date
 *   COMPANY_NAME — payer company name (max 40 chars)
 *   TOTAL_AMOUNT — sum of all detail amounts, peso with 2 dec (e.g. "12345.67")
 *   RECORD_COUNT — count of DETAIL rows (integer)
 *
 * DETAIL (1 line per employee):
 *   D|SEQ|ACCTNO|ACCTNAME|AMOUNT|REFNO|REMARKS
 *
 *   SEQ      — 1-based sequence number
 *   ACCTNO   — destination account number (blank if missing)
 *   ACCTNAME — account holder name (blank if missing)
 *   AMOUNT   — peso amount with 2 dec
 *   REFNO    — employee number (payroll reference)
 *   REMARKS  — literal "PAYROLL"
 *
 * Rows where accountNumber is null are still emitted (blank ACCTNO) so the
 * operator can identify employees who need bank data added.
 */
import type { BankFileInput } from "./types";
import { formatPeso, formatDateMDY } from "./types";

export { type BankFileInput as BdoFileInput };

export function formatBdoFile(input: BankFileInput): string {
  const { companyName, valueDate, batchReference, rows } = input;
  const lines: string[] = [];

  let totalCents = 0n;
  for (const row of rows) {
    totalCents += row.netPayCents;
  }

  // HEADER
  lines.push(
    [
      "H",
      batchReference.substring(0, 20),
      formatDateMDY(valueDate),
      companyName.substring(0, 40),
      formatPeso(totalCents),
      rows.length.toString(),
    ].join("|"),
  );

  // DETAIL rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    lines.push(
      [
        "D",
        (i + 1).toString(),
        row.accountNumber ?? "",
        (row.accountName ?? "").substring(0, 40),
        formatPeso(row.netPayCents),
        row.employeeNumber.substring(0, 20),
        "PAYROLL",
      ].join("|"),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
