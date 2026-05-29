/**
 * ATS validation schemas (Phase W)
 */
import { z } from "zod";

const cuid = z.string().min(1);

// ---------------------------------------------------------------------------
// JobPosting
// ---------------------------------------------------------------------------

export const createJobPostingSchema = z.object({
  title: z.string().min(1).max(200),
  code: z
    .string()
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, digits, hyphens, or underscores")
    .max(50)
    .optional(),
  description: z.string().max(10_000).optional(),
  departmentId: cuid.optional(),
  branchId: cuid.optional(),
  positionId: cuid.optional(),
  headcount: z.number().int().min(1).max(9999).default(1),
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).default("DRAFT"),
  openedAt: z.coerce.date().optional(),
  closedAt: z.coerce.date().optional(),
});

export const updateJobPostingSchema = createJobPostingSchema.partial();

export const listJobPostingsSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).optional(),
  departmentId: cuid.optional(),
  branchId: cuid.optional(),
  positionId: cuid.optional(),
  includeDeleted: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

// ---------------------------------------------------------------------------
// Applicant
// ---------------------------------------------------------------------------

export const createApplicantSchema = z.object({
  jobPostingId: cuid,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(30).optional(),
  source: z
    .enum(["REFERRAL", "ONLINE_POSTING", "WALK_IN", "AGENCY", "OTHER"])
    .default("ONLINE_POSTING"),
  assignedToUserId: cuid.optional(),
});

export const updateApplicantSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(30).optional(),
  stage: z
    .enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"])
    .optional(),
  source: z
    .enum(["REFERRAL", "ONLINE_POSTING", "WALK_IN", "AGENCY", "OTHER"])
    .optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  assignedToUserId: cuid.nullable().optional(),
});

export const listApplicantsSchema = z.object({
  jobPostingId: cuid.optional(),
  stage: z
    .enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"])
    .optional(),
  source: z
    .enum(["REFERRAL", "ONLINE_POSTING", "WALK_IN", "AGENCY", "OTHER"])
    .optional(),
  includeDeleted: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const advanceApplicantSchema = z.object({
  stage: z.enum(["SCREENING", "INTERVIEW", "OFFER", "HIRED"]),
});

export const rejectApplicantSchema = z.object({
  rejectionReason: z.string().min(1).max(2000).optional(),
});

export const hireApplicantSchema = z.object({
  hireDate: z.coerce.date(),
  departmentId: cuid.optional(),
  branchId: cuid.optional(),
  positionId: cuid.optional(),
  jobTitle: z.string().max(200).optional(),
  payFrequency: z
    .enum(["MONTHLY", "SEMI_MONTHLY", "WEEKLY", "DAILY"])
    .default("SEMI_MONTHLY"),
  salaryType: z.enum(["MONTHLY", "DAILY", "HOURLY"]).default("MONTHLY"),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACTUAL", "PROJECT_BASED", "PROBATIONARY"])
    .default("FULL_TIME"),
});

// ---------------------------------------------------------------------------
// ApplicantNote
// ---------------------------------------------------------------------------

export const createApplicantNoteSchema = z.object({
  body: z.string().min(1).max(10_000),
});
