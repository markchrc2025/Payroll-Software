/**
 * Zod validation schemas for PayrollBook + run operations (Phase D3).
 */
import { z } from "zod";
import {
  AdjustmentKind,
  PayFrequency,
  PayrollBookStatus,
  PayrollRunType,
  SeparationReason,
} from "@prisma/client";

export const createPayrollRunSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    cycle: z.nativeEnum(PayFrequency),
    runType: z.nativeEnum(PayrollRunType).default("REGULAR"),
    notes: z.string().max(500).optional().nullable(),
    /**
     * Restrict sheet fan-out to these employee IDs (1–200).
     * Omit to include all active employees (default behaviour).
     */
    employeeIds: z.array(z.string().min(1)).min(1).max(200).optional(),
    /**
     * When true, SSS/PhilHealth/Pag-IBIG are skipped for every sheet.
     * WHT is still applied.  Stored on the book so recompute preserves it.
     */
    skipStatutory: z.boolean().default(false),
    /**
     * Required for FINAL_PAY runs. Determines DOLE separation pay entitlement
     * and taxability of the payment.
     */
    separationReason: z.nativeEnum(SeparationReason).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.periodEnd < v.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "periodEnd must be on or after periodStart",
      });
    }
  });

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const listPayrollRunsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(PayrollBookStatus).optional(),
  runType: z.nativeEnum(PayrollRunType).optional(),
});
export type ListPayrollRunsInput = z.infer<typeof listPayrollRunsSchema>;

/**
 * Schema for creating a PayrollAdjustment on a DRAFT payroll book.
 * `amountCents` is a coerced bigint string (e.g. "5000"); must be > 0.
 */
export const createAdjustmentSchema = z.object({
  employeeId: z.string().cuid(),
  kind: z.nativeEnum(AdjustmentKind),
  /** Amount in centavos, always positive — kind determines sign direction. */
  amountCents: z.coerce.bigint().refine((v) => v > 0n, {
    message: "amountCents must be greater than 0",
  }),
  isTaxable: z.boolean(),
  reason: z.string().min(1).max(500),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
