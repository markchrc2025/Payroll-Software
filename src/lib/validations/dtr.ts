/**
 * Zod schemas for DTR / Timesheet (Phase J)
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shift Schedules
// ---------------------------------------------------------------------------

const HH_MM = z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format");

const WEEKDAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const SHIFT_TYPES    = ["FIXED", "FLEXIBLE", "OPEN"] as const;
const BREAK_POLICIES = ["FIXED_DEDUCTION", "FLOATING", "TRACK_ACTUAL", "PUNCH_IN_OUT", "PAID_BREAK"] as const;
const OT_BREAK_MODES = ["NONE", "SINGLE", "TIERED"] as const;

/** Per-shift overtime-policy fields shared by create/update. */
const otPolicyFields = {
  otRequiresApproval:  z.boolean().default(true),
  otAutoApprove:       z.boolean().default(false),
  otBreakMode:         z.enum(OT_BREAK_MODES).default("NONE"),
  otBreakTriggerHours: z.number().min(0).max(24).optional().nullable(),
  otBreakBlockHours:   z.number().min(0).max(24).optional().nullable(),
  otBreakMinutes:      z.number().int().min(0).max(480).optional().nullable(),
};

/** Validate that the chosen OT break mode has the fields it needs. */
function refineOtPolicy(
  data: {
    otBreakMode?: (typeof OT_BREAK_MODES)[number];
    otBreakTriggerHours?: number | null;
    otBreakBlockHours?: number | null;
    otBreakMinutes?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.otBreakMode === "SINGLE") {
    if (!data.otBreakTriggerHours) ctx.addIssue({ code: "custom", path: ["otBreakTriggerHours"], message: "Trigger hours required for SINGLE mode" });
    if (!data.otBreakMinutes)      ctx.addIssue({ code: "custom", path: ["otBreakMinutes"],      message: "Break minutes required for SINGLE mode" });
  }
  if (data.otBreakMode === "TIERED") {
    if (!data.otBreakBlockHours) ctx.addIssue({ code: "custom", path: ["otBreakBlockHours"], message: "Block hours required for TIERED mode" });
    if (!data.otBreakMinutes)    ctx.addIssue({ code: "custom", path: ["otBreakMinutes"],    message: "Break minutes required for TIERED mode" });
  }
}

export const createShiftScheduleSchema = z
  .object({
    name:               z.string().min(1).max(100),
    code:               z.string().max(20).optional().nullable(),
    type:               z.enum(SHIFT_TYPES).default("FIXED"),
    timeIn:             HH_MM.optional().nullable(),
    timeOut:            HH_MM.optional().nullable(),
    coreTimeIn:         HH_MM.optional().nullable(),
    coreTimeOut:        HH_MM.optional().nullable(),
    requiredHours:      z.number().min(0).max(24).optional().nullable(),
    gracePeriodMinutes: z.number().int().min(0).max(60).default(0),
    breakMinutes:       z.number().int().min(0).max(480).default(60),
    breakPolicy:        z.enum(BREAK_POLICIES).default("FIXED_DEDUCTION"),
    crossesMidnight:    z.boolean().default(false),
    workDays:           z.array(z.enum(WEEKDAY_CODES)).min(1).max(7),
    otThresholdMinutes: z.number().int().min(0).optional().nullable(),
    ...otPolicyFields,
    isActive:           z.boolean().default(true).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "FIXED") {
      if (!data.timeIn)  ctx.addIssue({ code: "custom", path: ["timeIn"],  message: "timeIn is required for FIXED shifts" });
      if (!data.timeOut) ctx.addIssue({ code: "custom", path: ["timeOut"], message: "timeOut is required for FIXED shifts" });
    }
    refineOtPolicy(data, ctx);
  });

export const updateShiftScheduleSchema = z
  .object({
    name:               z.string().min(1).max(100).optional(),
    code:               z.string().max(20).optional().nullable(),
    type:               z.enum(SHIFT_TYPES).optional(),
    timeIn:             HH_MM.optional().nullable(),
    timeOut:            HH_MM.optional().nullable(),
    coreTimeIn:         HH_MM.optional().nullable(),
    coreTimeOut:        HH_MM.optional().nullable(),
    requiredHours:      z.number().min(0).max(24).optional().nullable(),
    gracePeriodMinutes: z.number().int().min(0).max(60).optional(),
    breakMinutes:       z.number().int().min(0).max(480).optional(),
    breakPolicy:        z.enum(BREAK_POLICIES).optional(),
    crossesMidnight:    z.boolean().optional(),
    workDays:           z.array(z.enum(WEEKDAY_CODES)).min(1).max(7).optional(),
    otThresholdMinutes: z.number().int().min(0).optional().nullable(),
    otRequiresApproval:  z.boolean().optional(),
    otAutoApprove:       z.boolean().optional(),
    otBreakMode:         z.enum(OT_BREAK_MODES).optional(),
    otBreakTriggerHours: z.number().min(0).max(24).optional().nullable(),
    otBreakBlockHours:   z.number().min(0).max(24).optional().nullable(),
    otBreakMinutes:      z.number().int().min(0).max(480).optional().nullable(),
    isActive:           z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    refineOtPolicy(data, ctx);
  });

export const listShiftSchedulesSchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v !== "false")),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
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

// ---------------------------------------------------------------------------
// DTR Submissions
// ---------------------------------------------------------------------------

export const DTR_MANUAL_REASON_CODES = [
  "FORGOT_CLOCK_IN",
  "FORGOT_CLOCK_OUT",
  "GPS_FAILURE",
  "KIOSK_OFFLINE",
  "SYSTEM_ERROR",
  "SCHEDULE_CHANGE",
  "OTHER",
] as const;

export const DTR_SUBMISSION_STATUSES = [
  "SUBMITTED",
  "SUPERVISOR_APPROVED",
  "MANAGER_APPROVED",
  "RETURNED",
] as const;

export const createDtrSubmissionSchema = z.object({
  employeeId: z.string().cuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

export const listDtrSubmissionsSchema = z.object({
  employeeId: z.string().cuid().optional(),
  status: z.enum(DTR_SUBMISSION_STATUSES).optional(),
  periodStart: z.string().date().optional(),
  periodEnd: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const returnDtrSubmissionSchema = z.object({
  reason: z.string().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// Manual time override (admin/supervisor)
// ---------------------------------------------------------------------------

export const manualTimeOverrideSchema = z.object({
  /** "manualTimeIn" | "manualTimeOut" */
  field: z.enum(["manualTimeIn", "manualTimeOut"]),
  /** Full ISO-8601 datetime string, or null to clear the override. */
  value: z.string().datetime({ offset: true }).nullable(),
  reasonCode: z.enum(DTR_MANUAL_REASON_CODES),
  notes: z.string().max(1000).optional().nullable(),
  /** Link the audit entry to the open submission, if known. */
  dtrSubmissionId: z.string().cuid().optional().nullable(),
});
