/**
 * POST /api/employees/[id]/offboard
 *
 * Initiates the offboarding process for an employee:
 *   1. Validates the employee is active (not already a terminal status).
 *   2. Updates `employmentStatus` to RESIGNED or TERMINATED based on
 *      `separationReason`.
 *   3. Optionally creates a DRAFT FINAL_PAY PayrollBook for the employee.
 *   4. Writes an AuditLog entry.
 *
 * Returns: { employee, payrollBookId? }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { SeparationReason, EmploymentStatus } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok, serverError } from "@/lib/api-response";
import { createDraftRun } from "@/lib/payroll/persist";
import { writeAuditLog, getClientIp } from "@/lib/audit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a separation reason to the resulting EmploymentStatus. */
function resolveStatus(reason: SeparationReason): EmploymentStatus {
  switch (reason) {
    case SeparationReason.RESIGNATION:
    case SeparationReason.MUTUAL_AGREEMENT:
    case SeparationReason.END_OF_CONTRACT:
      return EmploymentStatus.RESIGNED;
    default:
      // REDUNDANCY, RETRENCHMENT, CLOSURE_OF_BUSINESS, DISEASE, JUST_CAUSE
      return EmploymentStatus.TERMINATED;
  }
}

const TERMINAL_STATUSES = new Set<EmploymentStatus>([
  EmploymentStatus.RESIGNED,
  EmploymentStatus.TERMINATED,
  EmploymentStatus.RETIRED,
]);

// ─── Validation ───────────────────────────────────────────────────────────────

const offboardSchema = z.object({
  separationReason: z.nativeEnum(SeparationReason),
  lastWorkingDay: z.coerce.date(),
  /**
   * If true, create a DRAFT FINAL_PAY PayrollBook scoped to this employee.
   * The caller supplies payPeriodStart and payFrequency for the run header.
   */
  createFinalPayRun: z.boolean().default(false),
  /** Required when createFinalPayRun = true. */
  payPeriodStart: z.coerce.date().optional(),
  payFrequency: z
    .enum(["DAILY", "WEEKLY", "SEMI_MONTHLY", "MONTHLY"])
    .default("MONTHLY"),
  notes: z.string().max(500).optional().nullable(),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
    if (guard instanceof Response) return guard;
    const { ctx } = guard;
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = offboardSchema.safeParse(body);
    if (!parsed.success)
      return err("Validation failed", 422, parsed.error.flatten());

    const {
      separationReason,
      lastWorkingDay,
      createFinalPayRun,
      payPeriodStart,
      payFrequency,
      notes,
    } = parsed.data;

    if (createFinalPayRun && !payPeriodStart) {
      return err(
        "payPeriodStart is required when createFinalPayRun is true",
        422,
      );
    }

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          employmentStatus: true,
          hireDate: true,
        },
      });
      if (!employee) return { notFound: true as const };

      if (TERMINAL_STATUSES.has(employee.employmentStatus)) {
        return {
          error: `Employee is already in terminal status: ${employee.employmentStatus}`,
        };
      }

      const newStatus = resolveStatus(separationReason);

      const updated = await tx.employee.update({
        where: { id },
        data: { employmentStatus: newStatus },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          employmentStatus: true,
        },
      });

      return { employee: updated };
    });

    if ("notFound" in result) return notFound("Employee");
    if ("error" in result) return err(result.error as string, 409);

    const { employee } = result;

    // ── Optional: create FINAL_PAY payroll run ──────────────────────────────
    let payrollBookId: string | undefined;

    if (createFinalPayRun && payPeriodStart) {
      const book = await createDraftRun({
        tenantId: ctx.tenantId,
        periodStart: payPeriodStart,
        periodEnd: lastWorkingDay,
        cycle: payFrequency as never,
        runType: "FINAL_PAY",
        notes: notes ?? null,
        createdByUserId: ctx.userId ?? null,
        employeeIds: [id],
        skipStatutory: false,
        separationReason,
      });
      payrollBookId = book.id;
    }

    // ── Audit log ───────────────────────────────────────────────────────────
    await writeAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId ?? null,
      action: "UPDATE",
      entity: "Employee",
      entityId: id,
      changes: {
        employmentStatus: employee.employmentStatus,
        separationReason,
        lastWorkingDay: lastWorkingDay.toISOString(),
        payrollBookId: payrollBookId ?? null,
      },
      ipAddress: getClientIp(req),
    });

    return ok(
      { employee, payrollBookId: payrollBookId ?? null },
      "Employee offboarded successfully",
    );
  } catch (e) {
    return serverError(e);
  }
}
