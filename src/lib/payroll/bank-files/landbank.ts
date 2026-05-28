/**
 * Phase H — Land Bank of the Philippines (LBP) batch payroll credit file
 * formatter.
 *
 * Format: pipe-delimited ( | ) text, CRLF line endings.
 *
 * HEADER (1 line):
 *   H|REFNO|DDMMYYYY|COMPANY_NAME|TOTALAMT|COUNT
 *
 *   REFNO        — batch reference (max 20 chars)
 *   DDMMYYYY     — value date
 *   COMPANY_NAME — payer company name (max 40 chars)
 *   TOTALAMT     — sum of detail amounts, peso with 2 dec
 *   COUNT        — number of detail records
 *
 * DETAIL (1 line per employee):
 *   D|SEQ|ACCTNO|ACCTNAME|AMOUNT|REMARKS
 *
 *   SEQ      — 1-based sequence number
 *   ACCTNO   — destination LBP account number (blank if missing)
 *   ACCTNAME — account holder name (max 40 chars; blank if missing)
 *   AMOUNT   — peso amount with 2 dec
 *   REMARKS  — employee number prefixed with "EMP-"
 */
import type { BankFileInput } from "./types";
import { formatPeso, formatDateDMY } from "./types";

export { type BankFileInput as LandbankFileInput };

export function formatLandbankFile(input: BankFileInput): string {
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
      formatDateDMY(valueDate),
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
        `EMP-${row.employeeNumber.substring(0, 16)}`,
      ].join("|"),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
