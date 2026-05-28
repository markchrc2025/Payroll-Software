/**
 * Shared input types for Philippine bank payroll credit file formatters.
 *
 * All new bank formatters (BDO, Metrobank, UnionBank, Landbank, PNB) accept
 * `BankFileInput`. BPI keeps its own legacy types from Phase D4.
 */

export interface BankFileRow {
  employeeNumber: string;
  accountNumber: string | null;
  accountName: string | null;
  /** Net pay in centavos (BigInt). */
  netPayCents: bigint;
}

export interface BankFileInput {
  /** Company / tenant name. */
  companyName: string;
  /** Value date for crediting (typically period end). */
  valueDate: Date;
  /** Unique batch reference — alphanumeric, max 20 chars. */
  batchReference: string;
  rows: BankFileRow[];
}

// ---------------------------------------------------------------------------
// Shared helpers (exported for reuse in individual formatters)
// ---------------------------------------------------------------------------

/** Left-justify a string in a fixed-width field, space-padded. */
export function padRight(s: string, width: number): string {
  return s.substring(0, width).padEnd(width, " ");
}

/** Right-justify (zero-pad) a string. */
export function padLeft(s: string, width: number): string {
  return s.substring(0, width).padStart(width, "0");
}

/**
 * Format centavos as a peso decimal string with 2 decimal places.
 * e.g. 1234567n → "12345.67"
 */
export function formatPeso(centavos: bigint): string {
  const abs = centavos < 0n ? -centavos : centavos;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return integer + "." + fraction;
}

/**
 * Format centavos as a zero-padded fixed-width peso amount (no decimal point
 * used by some banks — implied 2 decimal places).
 * e.g. 1234567n, width=15 → "000000000012345.67" trimmed to width
 *
 * For banks that use explicit decimal:
 *   integer portion = (width - 3) digits, then ".", then 2 digits
 */
export function formatAmountFixed(centavos: bigint, width: number): string {
  const abs = centavos < 0n ? -centavos : centavos;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, "0");
  const intWidth = width - 3; // account for "." + 2 fraction digits
  return padLeft(integer, intWidth) + "." + fraction;
}

/** Format a Date as YYYYMMDD (UTC). */
export function formatDateYMD(d: Date): string {
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return y + m + day;
}

/** Format a Date as MMDDYYYY (UTC). */
export function formatDateMDY(d: Date): string {
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const y = d.getUTCFullYear().toString();
  return m + day + y;
}

/** Format a Date as DDMMYYYY (UTC). */
export function formatDateDMY(d: Date): string {
  const day = d.getUTCDate().toString().padStart(2, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const y = d.getUTCFullYear().toString();
  return day + m + y;
}

/**
 * Escape a value for inclusion in a CSV field (RFC 4180).
 * Wraps in double-quotes and doubles any embedded double-quotes.
 */
export function csvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
