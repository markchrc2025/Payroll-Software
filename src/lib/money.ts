/**
 * Money helpers — Sentire Payroll
 * --------------------------------
 * All monetary values are stored as BigInt centavos (PHP / 100).
 * Conversion to/from human-facing decimal pesos happens at the system boundary
 * (API serialisation, form parsing, CSV import/export). Never use Number for
 * arithmetic on money.
 */

const CENTAVOS_PER_PESO = 100n;

/** Convert a peso amount (number, string, or Decimal-like) to BigInt centavos. */
export function toCentavos(input: number | string): bigint {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("Invalid peso amount");
    return BigInt(Math.round(input * 100));
  }
  const s = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new RangeError(`Invalid peso string: ${input}`);
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const wholeAbs = whole.replace("-", "");
  return sign * (BigInt(wholeAbs) * CENTAVOS_PER_PESO + BigInt(fracPadded));
}

/** Convert BigInt centavos to a pesos number (lossy for large values — display only). */
export function fromCentavos(cents: bigint): number {
  return Number(cents) / 100;
}

/** Format BigInt centavos as a peso string with 2 decimal places, e.g. "12,345.67". */
export function formatCentavos(cents: bigint, opts?: { withSymbol?: boolean }): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / CENTAVOS_PER_PESO;
  const frac = abs % CENTAVOS_PER_PESO;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracStr = frac.toString().padStart(2, "0");
  const body = `${negative ? "-" : ""}${wholeStr}.${fracStr}`;
  return opts?.withSymbol ? `₱${body}` : body;
}

/** JSON-safe serialiser for BigInt centavos fields (returns string). */
export function centavosToJson(cents: bigint | null | undefined): string | null {
  return cents == null ? null : cents.toString();
}
