/**
 * Phase H — Metrobank (Metropolitan Bank and Trust Co.) batch payroll
 * credit file formatter.
 *
 * Format: fixed-width text, CRLF line endings.
 *
 * HEADER (1 line, 46 chars):
 *   "H" (1) + BATCHREF (16) + YYYYMMDD (8) + RECCOUNT (6, zero-pad)
 *   + TOTALAMT (15, "############.##")
 *
 * DETAIL (1 line per employee, 80 chars):
 *   "D" (1) + SEQ (6, zero-pad) + ACCTNO (16, left-pad spaces)
 *   + ACCTNAME (30, right-pad spaces) + AMT (15) + EMPNO (12, right-pad)
 *
 * TRAILER (1 line, 22 chars):
 *   "T" (1) + RECCOUNT (6, zero-pad) + TOTALAMT (15)
 *
 * Missing account fields are represented as spaces in their fixed-width slot.
 */
import type { BankFileInput } from "./types";
import { padRight, padLeft, formatAmountFixed, formatDateYMD } from "./types";

export { type BankFileInput as MetrobankFileInput };

export function formatMetrobankFile(input: BankFileInput): string {
  const { valueDate, batchReference, rows } = input;
  const lines: string[] = [];

  let totalCents = 0n;
  for (const row of rows) {
    totalCents += row.netPayCents;
  }

  const totalAmtStr = formatAmountFixed(totalCents, 15);
  const recCount = rows.length.toString();

  // HEADER
  lines.push(
    "H" +
      padRight(batchReference.substring(0, 16), 16) +
      formatDateYMD(valueDate) +
      padLeft(recCount, 6) +
      totalAmtStr,
  );

  // DETAIL rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    lines.push(
      "D" +
        padLeft((i + 1).toString(), 6) +
        padRight(row.accountNumber ?? "", 16) +
        padRight((row.accountName ?? "").substring(0, 30), 30) +
        formatAmountFixed(row.netPayCents, 15) +
        padRight(row.employeeNumber.substring(0, 12), 12),
    );
    totalCents += 0n; // already summed above
  }

  // TRAILER
  lines.push("T" + padLeft(recCount, 6) + totalAmtStr);

  return lines.join("\r\n") + "\r\n";
}
