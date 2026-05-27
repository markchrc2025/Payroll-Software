/**
 * Phase D4 — Pure BPI ePay batch payroll credit formatter.
 *
 * Generates a fixed-width text file suitable for BPI corporate batch salary
 * credit upload. The format follows the BPI Direct Payroll Credit convention:
 *
 *   HEADER (1 line):
 *     pos  1     : Record type "H"
 *     pos  2-31  : Company name (30 chars, left-justified, space-padded)
 *     pos 32-39  : Value date YYYYMMDD
 *     pos 40-59  : Batch reference (20 chars, left-justified, space-padded)
 *     = 59 chars
 *
 *   DETAIL (1 line per employee):
 *     pos  1     : Record type "D"
 *     pos  2-17  : Account number (16 chars, left-justified, space-padded)
 *     pos 18-67  : Account name (50 chars, left-justified, space-padded)
 *     pos 68-82  : Amount  "############.##" (12 integer digits + "." + 2 dec = 15 chars)
 *     pos 83-94  : Employee number (12 chars, left-justified, space-padded)
 *     = 94 chars
 *
 *   TRAILER (1 line):
 *     pos  1    : Record type "T"
 *     pos  2-7  : Record count (6 chars, zero-padded)
 *     pos  8-22 : Total amount (15 chars, same format as detail amount)
 *     = 22 chars
 *
 * Lines are separated by CRLF (\r\n).
 *
 * Missing bank account numbers are represented by spaces (the row is still
 * emitted so the operator can see which employees need bank data). The caller
 * decides whether to filter before calling.
 */

export interface BpiDetailRow {
  employeeNumber: string;
  accountNumber: string | null;
  accountName: string | null;
  /** Net pay in centavos */
  netPayCents: bigint;
}

export interface FormatBpiFileInput {
  /** Tenant / company name used in the header */
  companyName: string;
  /** Value date for crediting (typically period end) */
  valueDate: Date;
  /** Batch reference string — alphanumeric, max 20 chars */
  batchReference: string;
  rows: BpiDetailRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Left-justify a string in a fixed-width field, padded with spaces. */
function padRight(s: string, width: number): string {
  return s.substring(0, width).padEnd(width, " ");
}

/** Zero-pad a number to a fixed width. */
function padLeft(s: string, width: number): string {
  return s.substring(0, width).padStart(width, "0");
}

/**
 * Format a centavos amount as a fixed-width 15-char string:
 * "############.##"  (12 integer digits + "." + 2 decimal digits)
 */
function formatAmount(centavos: bigint): string {
  const abs = centavos < 0n ? -centavos : centavos;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return padLeft(integer, 12) + "." + fraction;
}

/**
 * Format a Date as YYYYMMDD using UTC calendar fields.
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return y + m + day;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Returns the content of a BPI ePay batch file as a string with CRLF line endings.
 *
 * The function is pure and deterministic given identical inputs.
 */
export function formatBpiFile(input: FormatBpiFileInput): string {
  const { companyName, valueDate, batchReference, rows } = input;

  const lines: string[] = [];

  // HEADER
  const header =
    "H" +
    padRight(companyName, 30) +
    formatDate(valueDate) +
    padRight(batchReference, 20);
  lines.push(header);

  // DETAIL rows
  let totalCents = 0n;
  for (const row of rows) {
    const detail =
      "D" +
      padRight(row.accountNumber ?? "", 16) +
      padRight(row.accountName ?? "", 50) +
      formatAmount(row.netPayCents) +
      padRight(row.employeeNumber, 12);
    lines.push(detail);
    totalCents += row.netPayCents;
  }

  // TRAILER
  const trailer =
    "T" +
    padLeft(rows.length.toString(), 6) +
    formatAmount(totalCents);
  lines.push(trailer);

  return lines.join("\r\n");
}
