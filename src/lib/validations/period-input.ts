/**
 * Zod validation schemas for PeriodInput (Phase D2).
 *
 * Time fields are accepted as decimal strings ("8.50") for precision; they're
 * stored as Prisma `Decimal(6,2)`.
 */
import { z } from "zod";

const cuid = z.string().min(1);
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);

const timeFields = {
  daysWorked: decimal.default("0"),
  lateUndertimeMinutes: z.coerce.number().int().min(0).default(0),
  regularOtHours: decimal.default("0"),
  restDayHours: decimal.default("0"),
  specialHolidayHours: decimal.default("0"),
  regularHolidayHours: decimal.default("0"),
  nightDiffHours: decimal.default("0"),
  hazardHours: decimal.default("0"),
  unpaidLeaveDays: decimal.default("0"),
};

export const upsertPeriodInputSchema = z
  .object({
    employeeId: cuid,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    ...timeFields,
    notes: z.string().max(500).optional().nullable(),
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

export type UpsertPeriodInputInput = z.infer<typeof upsertPeriodInputSchema>;

export const updatePeriodInputSchema = z.object({
  daysWorked: decimal.optional(),
  lateUndertimeMinutes: z.coerce.number().int().min(0).optional(),
  regularOtHours: decimal.optional(),
  restDayHours: decimal.optional(),
  specialHolidayHours: decimal.optional(),
  regularHolidayHours: decimal.optional(),
  nightDiffHours: decimal.optional(),
  hazardHours: decimal.optional(),
  unpaidLeaveDays: decimal.optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type UpdatePeriodInputInput = z.infer<typeof updatePeriodInputSchema>;

export const listPeriodInputsSchema = z.object({
  employeeId: cuid.optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
