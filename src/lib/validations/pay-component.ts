/**
 * Zod validation schemas for PayComponent catalog and EmployeePayComponent
 * assignments (Phase D2).
 */
import { z } from "zod";
import {
  LoanStatus,
  LoanType,
  PayComponentKind,
  PayComponentTaxability,
} from "@prisma/client";

const cuid = z.string().min(1);
/** Pesos as a decimal string (e.g. "1500.00") — converted to centavos in route. */
const pesoString = z.string().regex(/^-?\d+(\.\d+)?$/);
const code = z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE");

export const createPayComponentSchema = z
  .object({
    code,
    name: z.string().min(1).max(120),
    kind: z.nativeEnum(PayComponentKind),
    taxability: z.nativeEnum(PayComponentTaxability).default("TAXABLE"),
    deMinimisCode: z.string().min(1).max(60).optional().nullable(),
    includeIn13thMonth: z.boolean().default(false),
    includeInSssBase: z.boolean().default(false),
    includeInPhilHealthBase: z.boolean().default(false),
    includeInPagibigBase: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.taxability === "DE_MINIMIS" && !v.deMinimisCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deMinimisCode"],
        message: "deMinimisCode is required when taxability = DE_MINIMIS",
      });
    }
  });

export type CreatePayComponentInput = z.infer<typeof createPayComponentSchema>;

export const updatePayComponentSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    kind: z.nativeEnum(PayComponentKind).optional(),
    taxability: z.nativeEnum(PayComponentTaxability).optional(),
    deMinimisCode: z.string().min(1).max(60).nullable().optional(),
    includeIn13thMonth: z.boolean().optional(),
    includeInSssBase: z.boolean().optional(),
    includeInPhilHealthBase: z.boolean().optional(),
    includeInPagibigBase: z.boolean().optional(),
    isActive: z.boolean().optional(),
  });

export type UpdatePayComponentInput = z.infer<typeof updatePayComponentSchema>;

export const listPayComponentsSchema = z.object({
  kind: z.nativeEnum(PayComponentKind).optional(),
  isActive: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// -----------------------------------------------------------------------------
// EmployeePayComponent (assignment)
// -----------------------------------------------------------------------------

export const assignPayComponentSchema = z
  .object({
    payComponentId: cuid,
    /// Pesos string. Stored as BigInt centavos.
    amount: pesoString,
    effectiveFrom: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after effectiveFrom",
      });
    }
  });

export type AssignPayComponentInput = z.infer<typeof assignPayComponentSchema>;

export const listAssignmentsSchema = z.object({
  /** Filter to assignments active on this date (effectiveFrom..endDate covers it). */
  asOf: z.coerce.date().optional(),
});

// -----------------------------------------------------------------------------
// Loan
// -----------------------------------------------------------------------------

export const createLoanSchema = z.object({
  employeeId: cuid,
  loanType: z.nativeEnum(LoanType),
  referenceNumber: z.string().max(80).optional().nullable(),
  principal: pesoString,
  installment: pesoString,
  /** Optional opening balance override; defaults to `principal`. */
  balance: pesoString.optional(),
  startDate: z.coerce.date(),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const updateLoanSchema = z.object({
  referenceNumber: z.string().max(80).nullable().optional(),
  installment: pesoString.optional(),
  balance: pesoString.optional(),
  status: z.nativeEnum(LoanStatus).optional(),
  closedDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;

export const listLoansSchema = z.object({
  employeeId: cuid.optional(),
  status: z.nativeEnum(LoanStatus).optional(),
  loanType: z.nativeEnum(LoanType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
