/**
 * Zod schemas for Expense Claims (Phase K)
 */
import { z } from "zod";

// Wave A2 (PAY-209): the category and type come from the company's lists
// (src/lib/expenses/claim-lists.ts). `category` may be an item's code or
// name; `categoryId` and `typeId` are the items themselves.
const listPick = {
  category: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().min(1).optional(),
  typeId: z.string().min(1).optional(),
};

export const createExpenseClaimSchema = z.object({
  employeeId: z.string(),
  ...listPick,
  description: z.string().min(1).max(1000),
  /// Amount in peso string: "1500.00"
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid peso amount"),
  claimDate: z.string().date(),
  receiptKey: z.string().optional().nullable(),
});

export const updateExpenseClaimSchema = z.object({
  ...listPick,
  description: z.string().min(1).max(1000).optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  claimDate: z.string().date().optional(),
  receiptKey: z.string().nullable().optional(),
});

// Wave A2: the treatment defaults from the claim's type; another one needs a reason.
export const approveExpenseClaimSchema = z.object({
  taxTreatment: z.enum([
    "NONTAXABLE_REIMBURSEMENT",
    "DE_MINIMIS",
    "TAXABLE",
  ]).optional(),
  reason: z.string().trim().max(500).optional(),
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
