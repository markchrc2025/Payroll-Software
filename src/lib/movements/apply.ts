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
  if (movement.toJobLevel != null) data.jobLevel = movement.toJobLevel;
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
}
