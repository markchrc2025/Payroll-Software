/**
 * GET  /api/employees/[id]/movements  — List movements for one employee
 * POST /api/employees/[id]/movements  — Create a new PENDING movement
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { toCentavos } from "@/lib/money";
import { createMovementSchema } from "@/lib/validations/movement";
import { serializeMovement } from "@/lib/movements/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { notFound: true as const };
    const movements = await tx.employeeMovement.findMany({
      where: { employeeId: id, tenantId: auth.tenantId },
      orderBy: [{ createdAt: "desc" }],
    });
    return { movements };
  });

  if ("notFound" in result) return notFound("Employee");
  return ok(result.movements.map(serializeMovement));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");
  const parsed = createMovementSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const v = parsed.data;

  const toBasicSalaryCents = v.toBasicSalary != null && v.toBasicSalary !== ""
    ? toCentavos(v.toBasicSalary)
    : null;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      include: {
        salaryHistory: {
          where: { endDate: null },
          orderBy: { effectiveDate: "desc" },
          take: 1,
          select: { basicSalaryCents: true },
        },
      },
    });
    if (!emp) return { notFound: true as const };

    // Initiator check: only Managers, HR staff (hr_manager OrgRole), or SUPER_ADMIN may create movements.
    if (auth.systemRole !== "SUPER_ADMIN") {
      const creatorEmp = await tx.employee.findFirst({
        where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (creatorEmp) {
        const [managedCount, hrRole] = await Promise.all([
          tx.employee.count({
            where: { managerId: creatorEmp.id, tenantId: auth.tenantId, deletedAt: null },
          }),
          tx.orgRole.findFirst({
            where: { employeeId: creatorEmp.id, tenantId: auth.tenantId, roleKey: "hr_manager" },
            select: { roleKey: true },
          }),
        ]);
        if (managedCount === 0 && !hrRole) return { forbidden: true as const };
      }
    }

    // Self-edit safeguard: admins cannot create movements for their own record.
    if (emp.userId && emp.userId === auth.userId) {
      return { selfEdit: true as const };
    }

    // Validate target references belong to this tenant.
    if (v.toDepartmentId) {
      const x = await tx.department.findFirst({
        where: { id: v.toDepartmentId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toDepartmentId not found in your tenant" as const };
    }
    if (v.toBranchId) {
      const x = await tx.branch.findFirst({
        where: { id: v.toBranchId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toBranchId not found in your tenant" as const };
    }
    if (v.toPositionId) {
      const x = await tx.position.findFirst({
        where: { id: v.toPositionId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toPositionId not found in your tenant" as const };
    }
    if (v.toLineManagerId) {
      const x = await tx.employee.findFirst({
        where: { id: v.toLineManagerId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toLineManagerId not found in your tenant" as const };
    }
    if (v.toImmediateSupervisorId) {
      const x = await tx.employee.findFirst({
        where: { id: v.toImmediateSupervisorId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toImmediateSupervisorId not found in your tenant" as const };
    }
    if (v.toLevelId) {
      const x = await tx.jobLevel.findFirst({
        where: { id: v.toLevelId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toLevelId not found in your tenant" as const };
    }
    if (v.toShiftScheduleId) {
      const x = await tx.shiftSchedule.findFirst({
        where: { id: v.toShiftScheduleId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toShiftScheduleId not found in your tenant" as const };
    }
    if (v.toWorkflowId) {
      const x = await tx.approvalWorkflow.findFirst({
        where: { id: v.toWorkflowId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!x) return { error: "toWorkflowId not found in your tenant" as const };
    }

    const currentBasic = emp.salaryHistory[0]?.basicSalaryCents ?? null;

    const movement = await tx.employeeMovement.create({
      data: {
        tenantId: auth.tenantId,
        employeeId: id,
        movementType: v.movementType,
        effectiveDate: v.effectiveDate,
        reason: v.reason ?? null,
        notes: v.notes ?? null,
        documentUrl: v.documentUrl ?? null,

        fromDepartmentId: emp.departmentId,
        toDepartmentId: v.toDepartmentId ?? null,
        fromBranchId: emp.branchId,
        toBranchId: v.toBranchId ?? null,
        fromPositionId: emp.positionId,
        toPositionId: v.toPositionId ?? null,
        fromJobTitle: emp.jobTitle,
        toJobTitle: v.toJobTitle ?? null,
        fromLevelId: emp.levelId,
        toLevelId: v.toLevelId ?? null,
        fromBasicSalaryCents: currentBasic,
        toBasicSalaryCents,
        fromStatus: emp.employmentStatus,
        toStatus: v.toStatus ?? null,

        fromLineManagerId:         emp.managerId,
        toLineManagerId:           v.toLineManagerId           ?? null,
        fromImmediateSupervisorId: emp.immediateSupervisorId,
        toImmediateSupervisorId:   v.toImmediateSupervisorId   ?? null,
        toWorkflowId:       v.toWorkflowId       ?? null,
        toJobTypeId:        v.toJobTypeId        ?? null,
        toJobStatusId:      v.toJobStatusId      ?? null,
        toShiftScheduleId:  v.toShiftScheduleId  ?? null,
        toTermStart:        v.toTermStart ? new Date(v.toTermStart) : null,
        toNextReviewDate:   v.toNextReviewDate ? new Date(v.toNextReviewDate) : null,

        approvalStatus: "PENDING",
        createdByUserId: auth.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "CREATE",
        entity: "EmployeeMovement",
        entityId: movement.id,
        changes: { after: { movementType: movement.movementType, status: "PENDING" } },
      },
    });

    return { movement };
  });

  if ("notFound" in result) return notFound("Employee");
  if ("forbidden" in result) return err("Only Managers and HR staff can initiate Movement Requests.", 403);
  if ("selfEdit" in result) return err("You cannot create a movement for your own employee record. Ask another administrator to submit this change.", 403);
  if ("error" in result && result.error) return err(result.error, 422);
  return ok(serializeMovement(result.movement), "Movement created", 201);
}
