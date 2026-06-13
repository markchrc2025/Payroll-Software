/**
 * Statutory rule payload schemas (Phase D1).
 *
 * Each row in `StatutoryRule` carries a polymorphic JSON `payload`. The shape
 * depends on `category`; this module defines a zod schema per category and a
 * discriminated runtime parser `parseStatutoryPayload(category, payload)` that
 * is used by both the seed loader and the resolver.
 *
 * Monetary fields are stored as INTEGER CENTAVOS (₱1 = 100). JSON cannot carry
 * BigInt, but every value here fits comfortably in JS's safe integer range
 * (Number.MAX_SAFE_INTEGER ≈ 9 × 10^15 centavos = ₱9 × 10^13 — far above any
 * conceivable statutory cap). Centavos are converted to BigInt by callers
 * before participating in payroll arithmetic (see `src/lib/money.ts`).
 */
import { z } from "zod";
import type { StatutoryCategory } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const centavos = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// SSS_SCHEDULE
//
// Stores the full published contribution table as uploaded from the official
// SSS Excel schedule. Each row corresponds to one compensation band.
// All monetary values are INTEGER CENTAVOS (₱1 = 100).
// ---------------------------------------------------------------------------
export const SssTableRow = z.object({
  compensationFrom: centavos, // 0 for the first (lowest) band
  compensationTo: centavos,
  msc: centavos,
  regularSSEmployer: centavos,
  regularSSEmployee: centavos,
  regularSSTotal: centavos,
  ecEmployer: centavos,
  mpfEmployer: centavos,
  mpfEmployee: centavos,
  mpfTotal: centavos,
  totalEmployer: centavos,
  totalEmployee: centavos,
  totalTotal: centavos,
});
export type SssTableRow = z.infer<typeof SssTableRow>;

export const SssSchedulePayload = z.object({
  rows: z.array(SssTableRow).min(1),
});
export type SssSchedulePayload = z.infer<typeof SssSchedulePayload>;

// ---------------------------------------------------------------------------
// PHILHEALTH_SCHEDULE
// ---------------------------------------------------------------------------
export const PhilHealthSchedulePayload = z.object({
  rate: ratio,
  split: z.object({ ee: ratio, er: ratio }),
  msc: z.object({ floor: centavos, ceiling: centavos }),
  premium: z.object({ min: centavos, max: centavos }),
});
export type PhilHealthSchedulePayload = z.infer<typeof PhilHealthSchedulePayload>;

// ---------------------------------------------------------------------------
// PAGIBIG_SCHEDULE
//
// Tiered by Monthly Fund Salary (MFS). MFS is capped at `mfsCap`. Each bracket
// has its own EE/ER rate; the last bracket has `upTo: null` (no upper bound;
// effectively `mfsCap`).
// ---------------------------------------------------------------------------
export const PagibigSchedulePayload = z.object({
  mfsCap: centavos,
  brackets: z
    .array(
      z.object({
        upTo: z.union([centavos, z.null()]),
        eeRate: ratio,
        erRate: ratio,
      }),
    )
    .min(1),
});
export type PagibigSchedulePayload = z.infer<typeof PagibigSchedulePayload>;

// ---------------------------------------------------------------------------
// BIR_WITHHOLDING_TABLE (TRAIN, 2023-onward)
//
// One payload carries all pay-frequency variants. Each bracket: tax is
// `fixedTax + plusRate × (compensation − floor)` when compensation falls
// between this bracket's `floor` (inclusive) and the next bracket's `floor`
// (exclusive). The last bracket extends to infinity.
// ---------------------------------------------------------------------------
const BirBracket = z.object({
  floor: centavos,
  fixedTax: centavos,
  plusRate: ratio,
});
export const BirWithholdingPayload = z.object({
  frequencies: z.object({
    DAILY: z.array(BirBracket).min(1).optional(),
    WEEKLY: z.array(BirBracket).min(1).optional(),
    SEMI_MONTHLY: z.array(BirBracket).min(1),
    MONTHLY: z.array(BirBracket).min(1),
  }),
});
export type BirWithholdingPayload = z.infer<typeof BirWithholdingPayload>;

// ---------------------------------------------------------------------------
// DE_MINIMIS_CEILING (RR 29-2025)
// ---------------------------------------------------------------------------
export const DeMinimisCeilingPayload = z.object({
  items: z
    .array(
      z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        // Some items are stated monthly, others annual, others per-occasion.
        // We carry whichever ceilings apply; nullable for unspecified.
        monthlyCeiling: z.union([centavos, z.null()]).optional(),
        annualCeiling: z.union([centavos, z.null()]).optional(),
        basis: z.string().min(1),
      }),
    )
    .min(1),
});
export type DeMinimisCeilingPayload = z.infer<typeof DeMinimisCeilingPayload>;

// ---------------------------------------------------------------------------
// MINIMUM_WAGE_RATE (RTWPB Wage Orders)
//
// Single row carries all regions in scope. The compute helper looks up by
// region code.
// ---------------------------------------------------------------------------
export const MinimumWagePayload = z.object({
  regions: z.record(
    z.string(), // region code, e.g. "NCR", "REGION_IV_A"
    z.object({
      label: z.string().min(1),
      // Daily minimum wage (non-agriculture / standard tier) in centavos.
      dailyRate: centavos,
      basis: z.string().min(1),
    }),
  ),
});
export type MinimumWagePayload = z.infer<typeof MinimumWagePayload>;

// ---------------------------------------------------------------------------
// Discriminated parser
// ---------------------------------------------------------------------------
export type StatutoryPayloadFor<C extends StatutoryCategory> =
  C extends "SSS_SCHEDULE" ? SssSchedulePayload
    : C extends "PHILHEALTH_SCHEDULE" ? PhilHealthSchedulePayload
    : C extends "PAGIBIG_SCHEDULE" ? PagibigSchedulePayload
    : C extends "BIR_WITHHOLDING_TABLE" ? BirWithholdingPayload
    : C extends "DE_MINIMIS_CEILING" ? DeMinimisCeilingPayload
    : C extends "MINIMUM_WAGE_RATE" ? MinimumWagePayload
    : never;

const SCHEMA_BY_CATEGORY = {
  SSS_SCHEDULE: SssSchedulePayload,
  PHILHEALTH_SCHEDULE: PhilHealthSchedulePayload,
  PAGIBIG_SCHEDULE: PagibigSchedulePayload,
  BIR_WITHHOLDING_TABLE: BirWithholdingPayload,
  DE_MINIMIS_CEILING: DeMinimisCeilingPayload,
  MINIMUM_WAGE_RATE: MinimumWagePayload,
} as const;

export function parseStatutoryPayload<C extends StatutoryCategory>(
  category: C,
  payload: unknown,
): StatutoryPayloadFor<C> {
  const schema = SCHEMA_BY_CATEGORY[category];
  if (!schema) {
    throw new Error(`Unknown statutory category: ${category}`);
  }
  return schema.parse(payload) as StatutoryPayloadFor<C>;
}
