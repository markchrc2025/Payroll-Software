/**
 * Movement workflow effects — applies an APPROVED EmployeeMovement to the
 * Employee record (and salary history when applicable). Runs inside a
 * withTenant() transaction supplied by the caller.
 */
import type { Prisma, EmployeeMovement } from "@prisma/client";

export async function applyMovementEffects(
  tx: Prisma.TransactionClient,
  movement: EmployeeMovement,
  actorUserId: string,
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

  if (Object.keys(data).length > 0) {
    await tx.employee.update({ where: { id: movement.employeeId }, data });
  }

  if (movement.toBasicSalaryCents != null) {
    // Close the currently-open salary row, then open a new one at effectiveDate.
    await tx.employeeSalary.updateMany({
      where: { employeeId: movement.employeeId, endDate: null },
      data: { endDate: movement.effectiveDate },
    });
    const emp = await tx.employee.findUniqueOrThrow({
      where: { id: movement.employeeId },
      select: { tenantId: true, salaryType: true },
    });
    await tx.employeeSalary.create({
      data: {
        employeeId: movement.employeeId,
        tenantId: emp.tenantId,
        basicSalaryCents: movement.toBasicSalaryCents,
        salaryType: emp.salaryType,
        effectiveDate: movement.effectiveDate,
        reason: movement.reason ?? `Movement ${movement.movementType}`,
        createdByUserId: actorUserId,
      },
    });
  }

  const isPlacement = movement.movementType === "PLACEMENT_CHANGE" || movement.movementType === "COMBINED_CHANGE";
  const isTerms     = movement.movementType === "TERMS_CHANGE"     || movement.movementType === "COMBINED_CHANGE";

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

  if (isTerms) {
    await tx.employmentTerm.create({
      data: {
        tenantId:         movement.tenantId,
        employeeId:       movement.employeeId,
        effectiveDate:    movement.effectiveDate,
        jobTypeId:        movement.toJobTypeId        ?? null,
        jobStatusId:      movement.toJobStatusId      ?? null,
        shiftScheduleId:  movement.toShiftScheduleId  ?? null,
        holidayKey:       movement.toHolidayKey       ?? null,
        termStart:        movement.toTermStart        ?? null,
        nextReviewDate:   movement.toNextReviewDate   ?? null,
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
