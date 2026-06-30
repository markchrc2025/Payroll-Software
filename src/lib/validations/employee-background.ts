/**
 * Validation schemas for the employee background modules — Education, Work
 * Experience, and Training. Each is a repeatable per-employee record; the
 * create and update payloads are identical (PUT does a full replace).
 *
 * Optional text/date/number fields treat ""/null/undefined as null so the
 * forms can send blank inputs without tripping validation.
 */
import { z } from "zod";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./document";

// ── shared preprocessors ─────────────────────────────────────────────────────
const optStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

const optDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.date().nullable().optional(),
);

const optYear = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().int().min(1900).max(2100).nullable().optional(),
);

const optInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(0).max(max).nullable().optional(),
  );

// ── Education ────────────────────────────────────────────────────────────────
export const EDUCATION_LEVELS = [
  "ELEMENTARY",
  "HIGH_SCHOOL",
  "SENIOR_HIGH",
  "VOCATIONAL",
  "COLLEGE",
  "MASTERS",
  "DOCTORATE",
  "OTHER",
] as const;

export const educationSchema = z
  .object({
    level: z.enum(EDUCATION_LEVELS).nullable().optional(),
    school: z.string().trim().min(1, "School is required").max(200),
    degree: optStr(200),
    fieldOfStudy: optStr(200),
    startYear: optYear,
    endYear: optYear,
    honors: optStr(200),
    notes: optStr(2000),
  })
  .refine(
    (v) => v.startYear == null || v.endYear == null || v.endYear >= v.startYear,
    { message: "End year can't be before start year", path: ["endYear"] },
  );

// ── Work Experience ──────────────────────────────────────────────────────────
export const workExperienceSchema = z
  .object({
    companyName: z.string().trim().min(1, "Company is required").max(200),
    position: z.string().trim().min(1, "Position is required").max(200),
    startDate: optDate,
    endDate: optDate,
    location: optStr(200),
    description: optStr(2000),
    reasonForLeaving: optStr(500),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "End date can't be before start date", path: ["endDate"] },
  );

// ── Training ─────────────────────────────────────────────────────────────────
export const trainingSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  provider: optStr(200),
  trainingDate: optDate,
  hours: optInt(100000),
  certificateKey: optStr(500),
  certificateFileName: optStr(255),
  certificateMimeType: optStr(255),
  certificateFileSize: z.number().int().positive().max(MAX_FILE_SIZE).nullable().optional(),
  expiresAt: optDate,
  notes: optStr(2000),
});

/** Browser asks permission to upload a training certificate to R2. */
export const trainingCertPresignSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, { error: "Unsupported file type" }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, `File must be ≤ ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

export type EducationInput = z.infer<typeof educationSchema>;
export type WorkExperienceInput = z.infer<typeof workExperienceSchema>;
export type TrainingInput = z.infer<typeof trainingSchema>;
