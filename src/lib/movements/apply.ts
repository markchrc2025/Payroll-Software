/**
 * Movement workflow effects — applies an APPROVED EmployeeMovement to the
 * Employee record and writes a new effective-dated EmploymentTerm snapshot
 * (which now carries compensation) when terms or salary change. Runs inside a
 * withTenant() transaction supplied by the caller.
 */
import type { Prisma, EmployeeMovement } from "@prisma/client";

export async function applyMovementEffects(
  tx: Prisma.TransactionClient,
  movement: EmployeeMovement,
): Promise<void> {
  const data: Prisma.EmployeeUpdateInput = {};

  if (movement.toDepartmentId) data.department = { connect: { id: movement.toDepartmentId } };
  if (movement.toBranchId) data.branch = { connect: { id: movement.toBranchId } };
  if (movement.toPositionId) data.position = { connect: { id: movement.toPositionId } };
  if (movement.toJobTitle != null) data.jobTitle = movement.toJobTitle;
  if (movement.toLevelId) data.level = { connect: { id: movement.toLevelId } };
  // Reporting chain — keep the live Employee record in sync so leave/DTR
  // approval routing resolves to the new manager/supervisor immediately.
  if (movement.toLineManagerId) data.manager = { connect: { id: movement.toLineManagerId } };
  if (movement.toImmediateSupervisorId)
    data.immediateSupervisor = { connect: { id: movement.toImmediateSupervisorId } };
  if (movement.toStatus != null) {
    data.employmentStatus = movement.toStatus;
    if (movement.movementType === "REGULARIZATION") {
      data.regularizationDate = movement.effectiveDate;
    }
  }
  // Keep the denormalised salaryType mirror on the Employee row in sync (used
  // for list/profile display). The effective-dated source of truth is the
  // EmploymentTerm snapshot written below.
  if (movement.toSalaryType != null) data.salaryType = movement.toSalaryType;

  if (Object.keys(data).length > 0) {
    await tx.employee.update({ where: { id: movement.employeeId }, data });
  }

  const isPlacement = movement.movementType === "PLACEMENT_CHANGE" || movement.movementType === "COMBINED_CHANGE";

  if (isPlacement) {
    await tx.placement.create({
      data: {
        tenantId:      movement.tenantId,
        employeeId:    movement.employeeId,
        effectiveDate: movement.effectiveDate,
        positionId:    movement.toPositionId    ?? null,
        jobTitle:      movement.toJobTitle      ?? null,
        lineManagerId: movement.toLineManagerId ?? null,
        immediateSupervisorId: movement.toImmediateSupervisorId ?? null,
        departmentId:  movement.toDepartmentId  ?? null,
        branchId:      movement.toBranchId      ?? null,
        levelId:       movement.toLevelId       ?? null,
        workflowId:    movement.toWorkflowId    ?? null,
        remark:        movement.reason          ?? null,
      },
    });
  }

  // Employment Terms now include compensation (salary amount + type). Any
  // movement that changes a term OR salary field writes a NEW complete
  // EmploymentTerm snapshot: unchanged fields are carried forward from the
  // latest row so "latest effective term" always reflects the full in-force
  // state the payroll engine reads.
  const touchesSalary =
    movement.toBasicSalaryCents != null || movement.toSalaryType != null;
  const touchesTerms =
    movement.toJobTypeId != null ||
    movement.toJobStatusId != null ||
    movement.toShiftScheduleId != null ||
    movement.toTermStart != null ||
    movement.toNextReviewDate != null;

  if (touchesSalary || touchesTerms) {
    const [latest, emp] = await Promise.all([
      tx.employmentTerm.findFirst({
        where: { employeeId: movement.employeeId },
        orderBy: { effectiveDate: "desc" },
      }),
      tx.employee.findUniqueOrThrow({
        where: { id: movement.employeeId },
        select: { salaryType: true },
      }),
    ]);
    await tx.employmentTerm.create({
      data: {
        tenantId:         movement.tenantId,
        employeeId:       movement.employeeId,
        effectiveDate:    movement.effectiveDate,
        jobTypeId:        movement.toJobTypeId        ?? latest?.jobTypeId        ?? null,
        jobStatusId:      movement.toJobStatusId      ?? latest?.jobStatusId      ?? null,
        shiftScheduleId:  movement.toShiftScheduleId  ?? latest?.shiftScheduleId  ?? null,
        termStart:        movement.toTermStart        ?? latest?.termStart        ?? null,
        nextReviewDate:   movement.toNextReviewDate   ?? latest?.nextReviewDate   ?? null,
        basicSalaryCents: movement.toBasicSalaryCents ?? latest?.basicSalaryCents ?? null,
        salaryType:       movement.toSalaryType       ?? latest?.salaryType       ?? emp.salaryType,
        remark:           movement.reason             ?? null,
      },
    });
  }

  // Sync EmployeeShiftAssignment so punch-time resolver sees the new shift immediately.
  if (movement.toShiftScheduleId) {
    await tx.employeeShiftAssignment.updateMany({
      where: { employeeId: movement.employeeId, tenantId: movement.tenantId, effectiveTo: null },
      data:  { effectiveTo: movement.effectiveDate },
    });
    await tx.employeeShiftAssignment.create({
      data: {
        tenantId:        movement.tenantId,
        employeeId:      movement.employeeId,
        shiftScheduleId: movement.toShiftScheduleId,
        effectiveFrom:   movement.effectiveDate,
        effectiveTo:     null,
      },
    });
  }
}
