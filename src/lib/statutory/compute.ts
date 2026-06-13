/**
 * Pure statutory compute functions (Phase D1).
 *
 * Each function takes (resolved rule payload, inputs) and returns BigInt
 * centavos. No DB access; no Date.now(); no I/O. This module is the seam
 * between "policy" (StatutoryRule.payload) and "math".
 *
 * MONEY UNITS:
 *   • Inputs (compensation, MSC, etc.) are BigInt centavos.
 *   • Rates are JS `number` (0.0–1.0).
 *   • All multiplications round HALF-UP at the centavo. BIR/SSS tables are
 *     published in pesos with implicit centavo rounding; HALF-UP matches
 *     standard payroll practice.
 */
import type { PayFrequency } from "@prisma/client";
import type {
  BirWithholdingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "./types";

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** HALF-UP multiplication: round((amountCentavos * rate)) → BigInt centavos. */
function multiplyHalfUp(amountCentavos: bigint, rate: number): bigint {
  // Convert through Number — safe because all real-world centavo amounts in
  // payroll fit well below 2^53. For ceilings/floors in the millions of pesos
  // (1e8 centavos) the precision loss in `Number(amount) * rate` is far below
  // 0.5 centavo.
  const n = Number(amountCentavos) * rate;
  return BigInt(Math.round(n));
}

function clamp(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ---------------------------------------------------------------------------
// SSS
// ---------------------------------------------------------------------------

export interface SssContribution {
  msc: bigint;
  /** Employee monthly contribution (regular + MPF EE share). */
  employee: bigint;
  /** Employer monthly contribution (regular + MPF ER share). */
  employer: bigint;
  /** Employer-only EC contribution. */
  ec: bigint;
  // Component breakdown for payslip / audit.
  breakdown: {
    eeRegular: bigint;
    erRegular: bigint;
    eeMpf: bigint;
    erMpf: bigint;
  };
}

export function computeSSS(
  payload: SssSchedulePayload,
  compensationCentavos: bigint,
): SssContribution {
  // Look up the row whose compensationTo is the first value >= compensation.
  // Rows are stored in ascending order of compensationTo (as uploaded from the
  // official SSS schedule). If compensation exceeds the highest row, use that
  // last row (ceiling band).
  const row =
    payload.rows.find((r) => compensationCentavos <= BigInt(r.compensationTo)) ??
    payload.rows[payload.rows.length - 1]!;

  return {
    msc: BigInt(row.msc),
    employee: BigInt(row.totalEmployee),
    employer: BigInt(row.totalEmployer),
    ec: BigInt(row.ecEmployer),
    breakdown: {
      eeRegular: BigInt(row.regularSSEmployee),
      erRegular: BigInt(row.regularSSEmployer),
      eeMpf: BigInt(row.mpfEmployee),
      erMpf: BigInt(row.mpfEmployer),
    },
  };
}

// ---------------------------------------------------------------------------
// PhilHealth
// ---------------------------------------------------------------------------

export interface PhilHealthContribution {
  msc: bigint;
  premium: bigint;
  employee: bigint;
  employer: bigint;
}

export function computePhilHealth(
  payload: PhilHealthSchedulePayload,
  compensationCentavos: bigint,
): PhilHealthContribution {
  const msc = clamp(
    compensationCentavos,
    BigInt(payload.msc.floor),
    BigInt(payload.msc.ceiling),
  );
  let premium = multiplyHalfUp(msc, payload.rate);
  premium = clamp(
    premium,
    BigInt(payload.premium.min),
    BigInt(payload.premium.max),
  );
  const employee = multiplyHalfUp(premium, payload.split.ee);
  // Employer share = premium − employee, so cents round-trip exactly.
  const employer = premium - employee;
  return { msc, premium, employee, employer };
}

// ---------------------------------------------------------------------------
// Pag-IBIG
// ---------------------------------------------------------------------------

export interface PagibigContribution {
  mfs: bigint;
  employee: bigint;
  employer: bigint;
}

export function computePagibig(
  payload: PagibigSchedulePayload,
  compensationCentavos: bigint,
): PagibigContribution {
  const mfs =
    compensationCentavos > BigInt(payload.mfsCap)
      ? BigInt(payload.mfsCap)
      : compensationCentavos;
  // Bracket selection uses the EMPLOYEE's actual compensation (not capped MFS)
  // to determine rate tier; contribution amount uses the capped MFS.
  // Convention: brackets are sorted ascending by `upTo`; `null` is sentinel
  // for "no upper bound".
  const bracket = payload.brackets.find(
    (b) => b.upTo === null || compensationCentavos <= BigInt(b.upTo),
  );
  if (!bracket) {
    throw new Error("Pag-IBIG: no bracket matched (payload misconfigured)");
  }
  const employee = multiplyHalfUp(mfs, bracket.eeRate);
  const employer = multiplyHalfUp(mfs, bracket.erRate);
  return { mfs, employee, employer };
}

// ---------------------------------------------------------------------------
// BIR Withholding
// ---------------------------------------------------------------------------

export interface BirWithholdingResult {
  /** Taxable compensation used for the bracket lookup (centavos). */
  taxable: bigint;
  /** Withholding tax due for the pay period (centavos). */
  tax: bigint;
  /** The bracket that matched (for audit / payslip). */
  bracket: { floor: bigint; fixedTax: bigint; plusRate: number };
}

export function lookupBIR(
  payload: BirWithholdingPayload,
  payFrequency: PayFrequency,
  taxableCentavos: bigint,
): BirWithholdingResult {
  const table = payload.frequencies[payFrequency as keyof typeof payload.frequencies];
  if (!table) {
    throw new Error(
      `BIR withholding table missing for pay frequency: ${payFrequency}`,
    );
  }
  // Brackets are sorted ascending by floor. Pick the bracket whose floor is
  // ≤ taxable and whose next bracket's floor is > taxable (or last bracket).
  let matched = table[0]!;
  for (const b of table) {
    if (taxableCentavos >= BigInt(b.floor)) {
      matched = b;
    } else {
      break;
    }
  }
  const floor = BigInt(matched.floor);
  const fixed = BigInt(matched.fixedTax);
  const excess = taxableCentavos - floor;
  const variable = excess > 0n ? multiplyHalfUp(excess, matched.plusRate) : 0n;
  const tax = fixed + variable;
  return {
    taxable: taxableCentavos,
    tax: tax > 0n ? tax : 0n,
    bracket: { floor, fixedTax: fixed, plusRate: matched.plusRate },
  };
}

// ---------------------------------------------------------------------------
// Minimum Wage
// ---------------------------------------------------------------------------

/** Returns true when daily rate ≥ region's published minimum wage. */
export function isMinimumWage(
  payload: MinimumWagePayload,
  regionCode: string,
  dailyRateCentavos: bigint,
): boolean {
  const region = payload.regions[regionCode];
  if (!region) {
    throw new Error(
      `Minimum wage rate not defined for region: ${regionCode}`,
    );
  }
  return dailyRateCentavos <= BigInt(region.dailyRate);
}

export function getMinimumWage(
  payload: MinimumWagePayload,
  regionCode: string,
): bigint {
  const region = payload.regions[regionCode];
  if (!region) {
    throw new Error(
      `Minimum wage rate not defined for region: ${regionCode}`,
    );
  }
  return BigInt(region.dailyRate);
}
