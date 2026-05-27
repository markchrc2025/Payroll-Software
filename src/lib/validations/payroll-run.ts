/**
 * Zod validation schemas for PayrollBook + run operations (Phase D3).
 */
import { z } from "zod";
import {
  PayFrequency,
  PayrollBookStatus,
  PayrollRunType,
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
