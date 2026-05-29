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

/**
 * HALF-UP round a fractional centavo value to the nearest whole centavo.
 * Input is a raw number already in centavos (e.g. 137930.5 → 137931n).
 * Use this as the single rounding primitive for all engine arithmetic.
 */
export function roundHalfUp(centavosValue: number): bigint {
  return BigInt(Math.round(centavosValue));
}

/**
 * Multiply BigInt centavos by a rate (JS number), rounding HALF-UP.
 * Example: multiply(1_000_000n, 0.05) → 50_000n  (₱10,000 × 5% = ₱500)
 */
export function multiply(cents: bigint, rate: number): bigint {
  return BigInt(Math.round(Number(cents) * rate));
}

/**
 * Split `totalCentavos` into `n` equal shares, rounding HALF-UP.
 * Any indivisible residual centavo goes to the FIRST share (index 0).
 *
 * Invariant: shares.reduce((a,b) => a+b, 0n) === totalCentavos (no centavo
 * created or lost).
 *
 * Example: split(10001n, 2) → [5001n, 5000n]
 */
export function split(totalCentavos: bigint, n: number): bigint[] {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new RangeError("split: n must be a positive integer");
  }
  const bigN = BigInt(n);
  const base = totalCentavos / bigN;
  const residual = totalCentavos % bigN;
  return Array.from({ length: n }, (_, i) =>
    i === 0 ? base + residual : base,
  );
}
