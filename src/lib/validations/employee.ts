/**
 * Zod validation schemas for Employee module.
 * Used by both API routes (server-side) and forms (client-side via react-hook-form).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum mirrors — defined here instead of importing from @prisma/client so that
// this file is safe to use in Client Components. Next.js restricts
// @prisma/client to server-only bundles; importing it in a shared validation
// file pulled into EmployeeForm.tsx (a "use client" component) causes a
// build-time "module-not-found" error on the browser bundle.
//
// These values MUST stay in sync with prisma/schema.prisma.
// ---------------------------------------------------------------------------

const CivilStatus = {
  SINGLE: "SINGLE",
  MARRIED: "MARRIED",
  WIDOWED: "WIDOWED",
  LEGALLY_SEPARATED: "LEGALLY_SEPARATED",
} as const;

const EmploymentStatus = {
  PROBATIONARY: "PROBATIONARY",
  REGULAR: "REGULAR",
  CONTRACTUAL: "CONTRACTUAL",
  PROJECT_BASED: "PROJECT_BASED",
  RESIGNED: "RESIGNED",
  TERMINATED: "TERMINATED",
  RETIRED: "RETIRED",
} as const;

const EmploymentType = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  CASUAL: "CASUAL",
} as const;

const Gender = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
} as const;

const PayFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  BI_WEEKLY: "BI_WEEKLY",
  SEMI_MONTHLY: "SEMI_MONTHLY",
  MONTHLY: "MONTHLY",
} as const;

const SalaryType = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;

const TaxClassification = {
  REGULAR: "REGULAR",
  MWE: "MWE",
} as const;

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

const phoneRegex = /^(\+63|0)[0-9]{9,10}$/;
const bankAccountRegex = /^[0-9\-\s]{6,20}$/;

// Philippine government ID formats
// TIN:        XXX-XXX-XXX (9–12 digits, optional dashes)
// SSS:        XX-XXXXXXX-X (10 digits, optional dashes)
// PhilHealth: XX-XXXXXXXXX-X (12 digits, optional dashes)
// Pag-IBIG:   XXXX-XXXX-XXXX (12 digits, optional dashes)
const tinRegex = /^[0-9-]{9,15}$/;
const sssRegex = /^[0-9-]{10,13}$/;
const philhealthRegex = /^[0-9-]{12,15}$/;
const pagibigRegex = /^[0-9-]{12,15}$/;

// Optional + nullable + accepts "" as null helper
const optionalString = (max = 100) =>
  z.string().max(max).optional().nullable().or(z.literal(""));

// HTML <input type="date"> emits "" when empty/cleared. A plain
// `z.coerce.date().optional().nullable()` would coerce "" → Invalid Date and
// FAIL validation (silently killing a whole-form submit). Treat "" (and null)
// as "no date" before coercion so an untouched/cleared optional date is valid.
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.date().nullable(),
);

// Optional foreign-key id. We do NOT format-check these as cuid: the records
// are real DB rows whose ids may be cuid v1 / cuid2 / etc., and referential
// integrity is enforced by the database, not by a client-side regex. A strict
// `.cuid()` here rejected legitimate Job Type / Job Status / department ids and
// silently blocked the form. "" / null / undefined all mean "not set".
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().min(1).nullable(),
);

// ---------------------------------------------------------------------------
// Statutory IDs sub-schema (one-to-one with Employee)
// ---------------------------------------------------------------------------

export const statutoryIdsSchema = z.object({
  tinNumber: z
    .string()
    .regex(tinRegex, "Invalid TIN format (e.g. 123-456-789)")
    .optional()
    .nullable()
    .or(z.literal("")),
  sssNumber: z
    .string()
    .regex(sssRegex, "Invalid SSS format (e.g. 12-3456789-0)")
    .optional()
    .nullable()
    .or(z.literal("")),
  philhealthNumber: z
    .string()
    .regex(philhealthRegex, "Invalid PhilHealth format (e.g. 12-345678901-2)")
    .optional()
    .nullable()
    .or(z.literal("")),
  pagibigNumber: z
    .string()
    .regex(pagibigRegex, "Invalid Pag-IBIG format (e.g. 1234-5678-9012)")
    .optional()
    .nullable()
    .or(z.literal("")),
  gsisMembershipId: optionalString(50),
});

export type StatutoryIdsInput = z.infer<typeof statutoryIdsSchema>;

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
  birthDate: optionalDate,
  gender: z.nativeEnum(Gender).optional().nullable(),
  civilStatus: z.nativeEnum(CivilStatus).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  // IANA timezone override for timekeeping; applies only when the tenant's
  // timekeepingTimezoneMode is EMPLOYEE (otherwise the company timezone is used).
  timezone: z.string().max(64).optional().nullable(),

  // R2 object key for an uploaded profile photo (set via /api/employees/photo/presign)
  photoKey: z.string().max(500).optional().nullable(),

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
  departmentId: optionalId,
  branchId: z.string().min(1, "Branch is required"),
  positionId: optionalId,
  immediateSupervisorId: optionalId,
  managerId: optionalId,
  jobTitle: z.string().max(150).optional().nullable(),
  levelId: optionalId,
  employmentStatus: z.nativeEnum(EmploymentStatus).default("PROBATIONARY"),
  employmentType: z.nativeEnum(EmploymentType).default("FULL_TIME"),
  hireDate: z.coerce.date({ error: "Hire date is required" }),
  regularizationDate: optionalDate,
  resignationDate: optionalDate,
  lastWorkingDate: optionalDate,
  endOfContractDate: optionalDate,

  // Payroll settings
  payFrequency: z.nativeEnum(PayFrequency).default("SEMI_MONTHLY"),
  salaryType: z.nativeEnum(SalaryType).default("MONTHLY"),
  standardWorkHours: z.coerce.number().min(1).max(24).default(8),
  standardWorkDays: z.coerce.number().min(1).max(31).default(22),

  // Initial salary (required on create) — PHP pesos. API converts to BigInt centavos.
  basicSalary: z.coerce
    .number({ error: "Basic salary is required" })
    .positive("Salary must be positive")
    .multipleOf(0.01),

  // BIR tax classification (REGULAR | MWE). Defaults to REGULAR.
  taxClassification: z
    .nativeEnum(TaxClassification)
    .optional()
    .default("REGULAR"),
  // Non-taxable portion of basic pay (e.g. MWE allowable) — PHP pesos.
  nontaxableBasicAmount: z.coerce.number().min(0).optional().default(0),

  // Bank details (stored encrypted)
  bankName: z.string().max(100).optional().nullable(),
  bankAccountNumber: z
    .string()
    .regex(bankAccountRegex, "Invalid account number format")
    .optional()
    .nullable()
    .or(z.literal("")),
  bankAccountName: z.string().max(200).optional().nullable(),

  // Statutory government IDs (nested — upserted in same transaction)
  statutoryIds: statutoryIdsSchema.optional(),

  // Extended personal
  nationalId: z.string().max(50).optional().nullable(),
  passportNumber: z.string().max(50).optional().nullable(),
  ethnicity: z.string().max(100).optional().nullable(),
  religion: z.string().max(100).optional().nullable(),
  allowProfileUpdate: z.coerce.boolean().optional().default(false),
  needsTimeClock: z.coerce.boolean().optional().default(true),
  geofenceExempt: z.coerce.boolean().optional().default(false),
  attendanceExempt: z.coerce.boolean().optional().default(false),

  // Extended employment
  placementEffectiveDate: optionalDate,
  jobTypeId: optionalId,
  jobStatusId: optionalId,
  workflowId: optionalId,
  shiftScheduleId: optionalId,
  termEffectiveDate: optionalDate,
  contractStartDate: optionalDate,
  contractEndDate: optionalDate,

  // Salary metadata
  salaryEffectiveDate: optionalDate,
  currency: z.string().max(10).optional().default("PHP"),
  payMethod: z.string().max(50).optional().nullable(),

  // Extended contact
  blogUrl: z.string().max(255).optional().nullable(),
  officePhone: z.string().max(50).optional().nullable(),
  housePhone: z.string().max(50).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().default("Philippines"),

  // Health
  heightCm: z.coerce.number().min(0).max(300).optional().nullable(),
  weightKg: z.coerce.number().min(0).max(600).optional().nullable(),
  bloodType: z.string().max(5).optional().nullable(),
  visionL: z.string().max(20).optional().nullable(),
  visionR: z.string().max(20).optional().nullable(),
  hearingL: z.string().max(20).optional().nullable(),
  hearingR: z.string().max(20).optional().nullable(),
  handL: z.string().max(20).optional().nullable(),
  handR: z.string().max(20).optional().nullable(),
  legL: z.string().max(20).optional().nullable(),
  legR: z.string().max(20).optional().nullable(),

  // Family / spouse
  spouseFirstName: z.string().max(100).optional().nullable(),
  spouseMiddleName: z.string().max(100).optional().nullable(),
  spouseLastName: z.string().max(100).optional().nullable(),
  spouseBirthDate: optionalDate,
  spouseNationality: z.string().max(100).optional().nullable(),
  spouseNationalId: z.string().max(50).optional().nullable(),
  spousePassport: z.string().max(50).optional().nullable(),
  spouseEthnicity: z.string().max(100).optional().nullable(),
  spouseReligion: z.string().max(100).optional().nullable(),
  spouseWorking: z.coerce.boolean().optional().nullable(),
  numberOfChildren: z.coerce.number().int().min(0).optional().default(0),

  // Directory & privacy
  directoryRole: z.string().max(50).optional().default("Employee"),
  pvEmail: z.string().max(50).optional().default("Employee"),
  pvBlog: z.string().max(50).optional().default("Employee"),
  pvOfficePhone: z.string().max(50).optional().default("Employee"),
  pvMobilePhone: z.string().max(50).optional().default("Employee"),
  pvHousePhone: z.string().max(50).optional().default("Not Accessible"),
  pvAddress: z.string().max(50).optional().default("Not Accessible"),
  pvEmergency: z.string().max(50).optional().default("Manager"),
  pvBirthday: z.string().max(50).optional().default("Employee"),
  pvFamilyBirthday: z.string().max(50).optional().default("Employee"),
  pvAnniversary: z.string().max(50).optional().default("Employee"),

  // Others
  remark: z.string().max(2000).optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema
  // Salary amount AND type are effective-dated on EmploymentTerm and change only
  // through movements — never via a plain profile edit (which would silently
  // desync the value the payroll engine reads).
  .omit({ basicSalary: true, salaryType: true })
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
    .transform((v) => {
      const upper = v.toUpperCase();
      return (upper in Gender) ? upper as keyof typeof Gender : undefined;
    })
    .optional(),
  civil_status: z
    .string()
    .transform((v) => {
      const upper = v.toUpperCase().replace(" ", "_");
      return (upper in CivilStatus) ? upper as keyof typeof CivilStatus : undefined;
    })
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
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesSchema>;
