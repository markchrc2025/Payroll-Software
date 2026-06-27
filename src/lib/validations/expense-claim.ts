/**
 * Zod schemas for Expense Claims (Phase K)
 */
import { z } from "zod";

const EXPENSE_CATEGORIES = [
  "TRANSPORTATION",
  "MEALS",
  "ACCOMMODATION",
  "COMMUNICATION",
  "OFFICE_SUPPLIES",
  "MEDICAL",
  "TRAINING",
  "ENTERTAINMENT",
  "OTHER",
] as const;

export const createExpenseClaimSchema = z.object({
  employeeId: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1).max(1000),
  /// Amount in peso string: "1500.00"
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid peso amount"),
  claimDate: z.string().date(),
  receiptKey: z.string().optional().nullable(),
});

export const updateExpenseClaimSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(1).max(1000).optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  claimDate: z.string().date().optional(),
  receiptKey: z.string().nullable().optional(),
});

export const approveExpenseClaimSchema = z.object({
  taxTreatment: z.enum([
    "NONTAXABLE_REIMBURSEMENT",
    "DE_MINIMIS",
    "TAXABLE",
  ]),
});

export const rejectExpenseClaimSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const attachExpenseClaimSchema = z.object({
  payrollBookId: z.string(),
});

export const listExpenseClaimsSchema = z.object({
  employeeId: z.string().optional(),
  status: z
    .enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ATTACHED", "PAID"])
    .optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
