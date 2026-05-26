/**
 * Zod validation schemas for Employee module.
 * Used by both API routes (server-side) and forms (client-side via react-hook-form).
 */

import { z } from "zod";
import {
  CivilStatus,
  EmploymentStatus,
  EmploymentType,
  Gender,
  PayFrequency,
  SalaryType,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

const phoneRegex = /^(\+63|0)[0-9]{9,10}$/;
const bankAccountRegex = /^[0-9\-\s]{6,20}$/;

// ---------------------------------------------------------------------------
// Create / Update Employee
// ---------------------------------------------------------------------------

export const createEmployeeSchema = z.object({
  // Personal
  firstName: z.string().min(1, "First name is required").max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1, "Last name is required").max(100),
  suffix: z.string().max(20).optional().nullable(),
  preferredName: z.string().max(100).optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  civilStatus: z.nativeEnum(CivilStatus).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),

  // Contact
  personalEmail: z.string().email().optional().nullable().or(z.literal("")),
  workEmail: z.string().email().optional().nullable().or(z.literal("")),
  mobileNumber: z
    .string()
    .regex(phoneRegex, "Invalid PH mobile number")
    .optional()
    .nullable()
    .or(z.literal("")),
  phoneNumber: z.string().max(20).optional().nullable(),

  // Address
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
  region: z.string().max(100).optional().nullable(),

  // Employment
  departmentId: z.string().cuid().optional().nullable(),
  branchId: z.string().cuid().optional().nullable(),
  jobTitle: z.string().max(150).optional().nullable(),
  jobLevel: z.string().max(100).optional().nullable(),
  employmentStatus: z.nativeEnum(EmploymentStatus).default("PROBATIONARY"),
  employmentType: z.nativeEnum(EmploymentType).default("FULL_TIME"),
  hireDate: z.coerce.date({ required_error: "Hire date is required" }),
  regularizationDate: z.coerce.date().optional().nullable(),
  resignationDate: z.coerce.date().optional().nullable(),
  lastWorkingDate: z.coerce.date().optional().nullable(),
  endOfContractDate: z.coerce.date().optional().nullable(),

  // Payroll settings
  payFrequency: z.nativeEnum(PayFrequency).default("SEMI_MONTHLY"),
  salaryType: z.nativeEnum(SalaryType).default("MONTHLY"),
  standardWorkHours: z.coerce.number().min(1).max(24).default(8),
  standardWorkDays: z.coerce.number().min(1).max(31).default(22),

  // Initial salary (required on create)
  basicSalary: z.coerce
    .number({ required_error: "Basic salary is required" })
    .positive("Salary must be positive")
    .multipleOf(0.0001),

  // Bank details (stored encrypted)
  bankName: z.string().max(100).optional().nullable(),
  bankAccountNumber: z
    .string()
    .regex(bankAccountRegex, "Invalid account number format")
    .optional()
    .nullable()
    .or(z.literal("")),
  bankAccountName: z.string().max(200).optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ basicSalary: true }) // Salary changes go through EmployeeSalary (effective dating)
  .partial()
  .extend({
    employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// ---------------------------------------------------------------------------
// CSV Bulk Import row schema
// Column headers (case-insensitive, snake_case):
//   first_name, last_name, middle_name, birth_date, gender, civil_status,
//   mobile_number, work_email, department_name, branch_name, job_title,
//   employment_type, employment_status, hire_date, pay_frequency,
//   salary_type, basic_salary, bank_name, bank_account_number, bank_account_name
// ---------------------------------------------------------------------------

export const csvEmployeeRowSchema = z.object({
  first_name: z.string().min(1, "first_name is required"),
  last_name: z.string().min(1, "last_name is required"),
  middle_name: z.string().optional(),
  birth_date: z.string().optional(),
  gender: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.nativeEnum(Gender).optional().catch(undefined))
    .optional(),
  civil_status: z
    .string()
    .transform((v) => v.toUpperCase().replace(" ", "_"))
    .pipe(z.nativeEnum(CivilStatus).optional().catch(undefined))
    .optional(),
  mobile_number: z.string().optional(),
  work_email: z.string().email().optional().or(z.literal("")),
  department_name: z.string().optional(),
  branch_name: z.string().optional(),
  job_title: z.string().optional(),
  employment_type: z
    .string()
    .transform((v) => v.toUpperCase().replace(" ", "_"))
    .pipe(z.nativeEnum(EmploymentType).catch("FULL_TIME"))
    .default("FULL_TIME"),
  employment_status: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.nativeEnum(EmploymentStatus).catch("PROBATIONARY"))
    .default("PROBATIONARY"),
  hire_date: z.string().min(1, "hire_date is required"),
  pay_frequency: z
    .string()
    .transform((v) => v.toUpperCase().replace(" ", "_"))
    .pipe(z.nativeEnum(PayFrequency).catch("SEMI_MONTHLY"))
    .default("SEMI_MONTHLY"),
  salary_type: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.nativeEnum(SalaryType).catch("MONTHLY"))
    .default("MONTHLY"),
  basic_salary: z
    .string()
    .transform((v) => parseFloat(v.replace(/,/g, "")))
    .pipe(z.number().positive("basic_salary must be positive")),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_account_name: z.string().optional(),
});

export type CsvEmployeeRow = z.infer<typeof csvEmployeeRowSchema>;

// ---------------------------------------------------------------------------
// Query params for employee list
// ---------------------------------------------------------------------------

export const listEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().optional(),
  departmentId: z.string().cuid().optional(),
  branchId: z.string().cuid().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesSchema>;
