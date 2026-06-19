/**
 * Zod validation schemas for Phase G Leave Management:
 *   LeaveType catalog, LeaveBalance seeding, LeaveTransaction filing/approval.
 */
import { z } from "zod";
import { AccrualFrequency, ApprovalStatus, LeaveTransactionType, LeaveUnit } from "@prisma/client";

const cuid = z.string().min(1);
const code = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE");

// ---------------------------------------------------------------------------
// LeaveType
// ---------------------------------------------------------------------------

export const createLeaveTypeSchema = z.object({
  code,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  isPaid: z.boolean().default(true),
  isConvertibleToCash: z.boolean().default(false),
  unit: z.nativeEnum(LeaveUnit).default("DAYS"),
  accrualFrequency: z.nativeEnum(AccrualFrequency).default("MONTHLY"),
  accrualAmount: z.coerce.number().min(0),
  maxAccruableBalance: z.coerce.number().min(0).optional().nullable(),
  carryOverLimit: z.coerce.number().min(0).optional().nullable(),
  requiresRegularization: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  isPaid: z.boolean().optional(),
  isConvertibleToCash: z.boolean().optional(),
  unit: z.nativeEnum(LeaveUnit).optional(),
  accrualFrequency: z.nativeEnum(AccrualFrequency).optional(),
  accrualAmount: z.coerce.number().min(0).optional(),
  maxAccruableBalance: z.coerce.number().min(0).optional().nullable(),
  carryOverLimit: z.coerce.number().min(0).optional().nullable(),
  requiresRegularization: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const listLeaveTypesSchema = z.object({
  isActive: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// LeaveBalance
// ---------------------------------------------------------------------------

export const upsertLeaveBalanceSchema = z.object({
  leaveTypeId: cuid,
  year: z.coerce.number().int().min(2020).max(2099),
  openingBalance: z.coerce.number().min(0).default(0),
});

export type UpsertLeaveBalanceInput = z.infer<typeof upsertLeaveBalanceSchema>;

export const listLeaveBalancesSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099).optional(),
});

// ---------------------------------------------------------------------------
// LeaveTransaction
// ---------------------------------------------------------------------------

export const fileLeaveRequestSchema = z
  .object({
    leaveTypeId: cuid,
    amount: z.coerce.number().positive().multipleOf(0.01),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    dayPortion: z.enum(["FULL", "HALF_AM", "HALF_PM"]).default("FULL"),
    reason: z.string().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be >= startDate",
      });
    }
    // Partial-day leaves must be a single date.
    if (v.dayPortion !== "FULL" && v.endDate.getTime() !== v.startDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayPortion"],
        message: "Half-day leave must be a single date",
      });
    }
  });

export type FileLeaveRequestInput = z.infer<typeof fileLeaveRequestSchema>;

export const rejectLeaveSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
});

export type RejectLeaveInput = z.infer<typeof rejectLeaveSchema>;

export const listLeaveTransactionsSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  type: z.nativeEnum(LeaveTransactionType).optional(),
  approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
