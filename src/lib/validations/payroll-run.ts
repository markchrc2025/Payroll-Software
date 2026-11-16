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
    /**
     * PAY-141: the scheduled payday (YYYY-MM-DD, as listed by
     * GET /api/payroll/paydays). For a REGULAR run the server fills the pay
     * period, the pay date and the DTR cutoff from the company's schedule.
     * Without it, periodStart and periodEnd are required (off-cycle, final
     * pay, year-end, and older callers).
     */
    payday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "payday must be YYYY-MM-DD").optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    cycle: z.nativeEnum(PayFrequency),
    runType: z.nativeEnum(PayrollRunType).default("REGULAR"),
    notes: z.string().max(500).optional().nullable(),
    /**
     * Restrict sheet fan-out to these employee IDs (1–200), stored on the book
     * (targetEmployeeIds) so the background compute and every recompute keep
     * the same people (PAY-135). Omit to include every employee the run type
     * selects. Required for FINAL_PAY.
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
    if (v.payday && v.runType !== "REGULAR") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payday"],
        message: "A payday is for regular runs; give the dates for other run types.",
      });
    }
    if (!v.payday && (!v.periodStart || !v.periodEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodStart"],
        message: "Pick a payday, or give periodStart and periodEnd.",
      });
      return;
    }
    if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "periodEnd must be on or after periodStart",
      });
    }
    // PAY-135: a final pay is for named leavers. Without a selection the run
    // would compute separation pay, leave cash-out and a prorated 13th month
    // for every active employee.
    if (v.runType === "FINAL_PAY" && !v.employeeIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeIds"],
        message: "A final pay run must name the separated employee(s).",
      });
    }
    if (v.runType === "FINAL_PAY" && !v.separationReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["separationReason"],
        message: "A final pay run needs the reason for separation.",
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
  employeeId: z.string(),
  kind: z.nativeEnum(AdjustmentKind),
  /** Amount in centavos, always positive — kind determines sign direction. */
  amountCents: z.coerce.bigint().refine((v) => v > 0n, {
    message: "amountCents must be greater than 0",
  }),
  isTaxable: z.boolean(),
  reason: z.string().min(1).max(500),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
