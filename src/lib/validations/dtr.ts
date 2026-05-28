/**
 * Zod schemas for DTR / Timesheet (Phase J)
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shift Schedules
// ---------------------------------------------------------------------------

const HH_MM = z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format");

const WEEKDAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const createShiftScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["FIXED", "FLEXIBLE"]).default("FIXED"),
  timeIn: HH_MM,
  timeOut: HH_MM,
  breakMinutes: z.number().int().min(0).max(480).default(60),
  crossesMidnight: z.boolean().default(false),
  workDays: z
    .array(z.enum(WEEKDAY_CODES))
    .min(1)
    .max(7),
});

export const updateShiftScheduleSchema = createShiftScheduleSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });

export const listShiftSchedulesSchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v !== "false")),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------------------------------------------------------------------------
// Shift Assignments
// ---------------------------------------------------------------------------

export const createShiftAssignmentSchema = z.object({
  shiftScheduleId: z.string().cuid(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional().nullable(),
});

// ---------------------------------------------------------------------------
// DTR Records
// ---------------------------------------------------------------------------

export const createDtrRecordSchema = z.object({
  employeeId: z.string().cuid(),
  date: z.string().date(),
  shiftScheduleId: z.string().cuid().optional().nullable(),
  dayStatus: z
    .enum(["PRESENT", "ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "HOLIDAY", "REST_DAY"])
    .default("PRESENT"),
  workedMinutes: z.number().int().min(0).default(0),
  lateMinutes: z.number().int().min(0).default(0),
  undertimeMinutes: z.number().int().min(0).default(0),
  otMinutes: z.number().int().min(0).default(0),
  nsdMinutes: z.number().int().min(0).default(0),
  hazardMinutes: z.number().int().min(0).default(0),
  holidayType: z
    .enum(["REGULAR_HOLIDAY", "SPECIAL_HOLIDAY"])
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateDtrRecordSchema = createDtrRecordSchema
  .omit({ employeeId: true, date: true })
  .partial();

export const listDtrRecordsSchema = z.object({
  employeeId: z.string().cuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// DTR Aggregate → PeriodInput
// ---------------------------------------------------------------------------

export const aggregateDtrSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  replace: z.boolean().default(false),
});
