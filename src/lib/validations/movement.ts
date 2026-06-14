/**
 * Zod validation schemas for EmployeeMovement workflow.
 */
import { z } from "zod";
import { EmploymentStatus, MovementType } from "@prisma/client";

const cuid = z.string().min(1);

export const createMovementSchema = z
  .object({
    movementType: z.nativeEnum(MovementType),
    effectiveDate: z.coerce.date(),
    reason: z.string().max(500).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    documentUrl: z.string().max(1000).optional().nullable(),

    // Target fields — interpretation depends on movementType.
    toDepartmentId: cuid.optional().nullable(),
    toBranchId: cuid.optional().nullable(),
    toPositionId: cuid.optional().nullable(),
    toJobTitle: z.string().max(150).optional().nullable(),
    toLevelId: cuid.optional().nullable(),
    /// Pesos as decimal string (e.g. "55000.00") — converted to centavos server-side.
    toBasicSalary: z.string().regex(/^-?\d+(\.\d+)?$/).optional().nullable(),
    toStatus: z.nativeEnum(EmploymentStatus).optional().nullable(),

    // Placement-scope fields
    toLineManagerId:    cuid.optional().nullable(),
    // Terms-scope fields
    toJobType:          z.string().max(50).optional().nullable(),
    toJobStatus:        z.string().max(50).optional().nullable(),
    toLeaveWorkflowKey: z.string().max(50).optional().nullable(),
    toShiftScheduleId:  cuid.optional().nullable(),
    toHolidayKey:       z.string().max(50).optional().nullable(),
    toTermStart:        z.string().optional().nullable(),
    toNextReviewDate:   z.string().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const has = (k: keyof typeof v) => v[k] !== undefined && v[k] !== null && v[k] !== "";
    const requireAny = (keys: (keyof typeof v)[]) => {
      if (!keys.some(has)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Movement type ${v.movementType} requires one of: ${keys.join(", ")}`,
        });
      }
    };
    const placementFields = ["toPositionId", "toJobTitle", "toLevelId", "toDepartmentId", "toBranchId", "toLineManagerId"] as const;
    const termsFields     = ["toJobType", "toJobStatus", "toLeaveWorkflowKey", "toShiftScheduleId", "toHolidayKey", "toTermStart", "toNextReviewDate"] as const;

    switch (v.movementType) {
      case "DEPARTMENT_TRANSFER":
        requireAny(["toDepartmentId"]);
        break;
      case "BRANCH_TRANSFER":
        requireAny(["toBranchId"]);
        break;
      case "PROMOTION":
      case "DEMOTION":
        requireAny(["toPositionId", "toJobTitle", "toLevelId", "toBasicSalary"]);
        break;
      case "SALARY_ADJUSTMENT":
        requireAny(["toBasicSalary"]);
        break;
      case "TITLE_CHANGE":
        requireAny(["toJobTitle", "toLevelId", "toPositionId"]);
        break;
      case "STATUS_CHANGE":
      case "REGULARIZATION":
        requireAny(["toStatus"]);
        break;
      case "PLACEMENT_CHANGE":
        requireAny([...placementFields]);
        break;
      case "TERMS_CHANGE":
        requireAny([...termsFields]);
        break;
      case "COMBINED_CHANGE":
        requireAny([...placementFields]);
        requireAny([...termsFields]);
        break;
    }
  });

export type CreateMovementInput = z.infer<typeof createMovementSchema>;

export const rejectMovementSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required").max(500),
});

export const listMovementsSchema = z.object({
  status: z.enum(["PENDING", "FOR_REVIEW", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  employeeId: cuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
