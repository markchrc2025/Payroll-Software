/**
 * Phase H — UnionBank of the Philippines batch payroll credit file formatter.
 *
 * Format: CSV (RFC 4180), CRLF line endings.
 *
 * Header row:
 *   "Account Number","Account Name","Amount","Reference Number","Remarks"
 *
 * Detail rows (one per employee):
 *   "<acctno>","<acctname>","<peso.cc>","<empno>","PAYROLL"
 *
 * All string fields are quoted per RFC 4180 (embedded double-quotes doubled).
 * Amounts are unquoted numeric strings with 2 decimal places.
 *
 * A summary row is appended after the last detail row:
 *   "TOTAL","","<total_peso.cc>","",""
 *
 * Rows with a null accountNumber emit a blank account number field.
 */
import type { BankFileInput } from "./types";
import { formatPeso, csvField } from "./types";

export { type BankFileInput as UnionBankFileInput };

export function formatUnionBankFile(input: BankFileInput): string {
  const { rows } = input;
  const lines: string[] = [];

  // Header row
  lines.push(
    [
      csvField("Account Number"),
      csvField("Account Name"),
      csvField("Amount"),
      csvField("Reference Number"),
      csvField("Remarks"),
    ].join(","),
  );

  let totalCents = 0n;
  for (const row of rows) {
    lines.push(
      [
        csvField(row.accountNumber ?? ""),
        csvField((row.accountName ?? "").substring(0, 50)),
        formatPeso(row.netPayCents),
        csvField(row.employeeNumber.substring(0, 20)),
        csvField("PAYROLL"),
      ].join(","),
    );
    totalCents += row.netPayCents;
  }

  // Summary row
  lines.push(
    [
      csvField("TOTAL"),
      csvField(""),
      formatPeso(totalCents),
      csvField(""),
      csvField(""),
    ].join(","),
  );

  return lines.join("\r\n") + "\r\n";
}
