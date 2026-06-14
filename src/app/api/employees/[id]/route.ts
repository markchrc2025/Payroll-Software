/**
 * GET    /api/employees/[id]  — Get full employee detail
 * PUT    /api/employees/[id]  — Update employee fields
 * DELETE /api/employees/[id]  — Soft-delete (sets deletedAt)
 */

import type { NextRequest } from "next/server";
import { StatutoryIdType } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { centavosToJson, toCentavos } from "@/lib/money";
import {
  ok,
  err,
  notFound,
} from "@/lib/api-response";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { employeeRefWhere } from "@/lib/employee-ref";

// ---------------------------------------------------------------------------
// GET /api/employees/[id]
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params; // Next.js 16: params is a Promise — may be an Employee ID or CUID

  const employee = await withTenant(auth.tenantId, (tx) => tx.employee.findFirst({
    where: employeeRefWhere(auth.tenantId, id),
    include: {
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      position: { select: { id: true, title: true, level: true } },
      level: { select: { id: true, name: true } },
      statutoryIds: true,
      salaryHistory: {
        where: { endDate: null },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
    },
  }));

  if (!employee) return notFound("Employee");

  // Serialise BigInt centavos for JSON safety.
  // Strip bcrypt hashes — never expose them; use boolean flags instead.
  const { essPin, kioskPinHash, ...rest } = employee;
  const serialised = {
    ...rest,
    hasEssPin: essPin !== null,
    hasKioskPin: kioskPinHash !== null,
    nontaxableBasicAmountCents: centavosToJson(employee.nontaxableBasicAmountCents),
    salaryHistory: employee.salaryHistory.map((s) => ({
      ...s,
      basicSalaryCents: centavosToJson(s.basicSalaryCents),
    })),
  };

  return ok(serialised);
}

// ---------------------------------------------------------------------------
// PUT /api/employees/[id]
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = updateEmployeeSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation failed", 422, parsed.error.flatten());

  const {
    departmentId,
    branchId,
    positionId,
    immediateSupervisorId,
    managerId,
    nontaxableBasicAmount,
    standardWorkHours,
    standardWorkDays,
    statutoryIds,
    ...rest
  } = parsed.data;

  // Ensure employee belongs to this tenant + run all writes in one tx
  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return { notFound: true as const };

    if (departmentId !== undefined && departmentId !== null) {
      const dept = await tx.department.findFirst({
        where: { id: departmentId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!dept) return { error: "Department not found in your tenant" as const };
    }
    if (branchId !== undefined && branchId !== null) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!branch) return { error: "Branch not found in your tenant" as const };
    }
    if (positionId !== undefined && positionId !== null) {
      const pos = await tx.position.findFirst({
        where: { id: positionId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!pos) return { error: "Position not found in your tenant" as const };
    }
    if (parsed.data.levelId !== undefined && parsed.data.levelId !== null) {
      const lvl = await tx.jobLevel.findFirst({
        where: { id: parsed.data.levelId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!lvl) return { error: "Level not found in your tenant" as const };
    }
    if (parsed.data.shiftScheduleId !== undefined && parsed.data.shiftScheduleId !== null) {
      const sched = await tx.shiftSchedule.findFirst({
        where: { id: parsed.data.shiftScheduleId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!sched) return { error: "Shift schedule not found in your tenant" as const };
    }

    const emp = await tx.employee.update({
      where: { id },
      data: {
        ...rest,
        ...(departmentId !== undefined && { departmentId }),
        ...(branchId !== undefined && { branchId }),
        ...(positionId !== undefined && { positionId }),
        ...(immediateSupervisorId !== undefined && { immediateSupervisorId }),
        ...(managerId !== undefined && { managerId }),
        ...(nontaxableBasicAmount !== undefined && {
          nontaxableBasicAmountCents: toCentavos(nontaxableBasicAmount),
        }),
        ...(standardWorkHours !== undefined && {
          standardWorkHours: standardWorkHours.toString(),
        }),
        ...(standardWorkDays !== undefined && {
          standardWorkDays: standardWorkDays.toString(),
        }),
      },
    });

    // Upsert statutory IDs only if the caller actually sent the object
    if (statutoryIds !== undefined) {
      const rows: { type: StatutoryIdType; value: string | null }[] = [
        { type: StatutoryIdType.TIN, value: emptyToNull(statutoryIds.tinNumber) },
        { type: StatutoryIdType.SSS, value: emptyToNull(statutoryIds.sssNumber) },
        { type: StatutoryIdType.PHILHEALTH, value: emptyToNull(statutoryIds.philhealthNumber) },
        { type: StatutoryIdType.PAGIBIG, value: emptyToNull(statutoryIds.pagibigNumber) },
        { type: StatutoryIdType.GSIS, value: emptyToNull(statutoryIds.gsisMembershipId) },
      ];
      for (const r of rows) {
        if (r.value == null) {
          await tx.statutoryId.deleteMany({
            where: { employeeId: id, type: r.type },
          });
          continue;
        }
        await tx.statutoryId.upsert({
          where: { employeeId_type: { employeeId: id, type: r.type } },
          create: {
            employeeId: id,
            tenantId: auth.tenantId,
            type: r.type,
            number: r.value,
          },
          update: { number: r.value },
        });
      }
    }

    return { employee: emp };
  });

  if ("notFound" in result) return notFound("Employee");
  if ("error" in result && result.error) return err(result.error, 404);

  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    ipAddress: getClientIp(req),
  });

  return ok(result.employee, "Employee updated");
}

/** Convert empty / undefined strings to null for DB storage. */
function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// ---------------------------------------------------------------------------
// DELETE /api/employees/[id]  — Soft delete
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "DELETE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const wasFound = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return false;
    await tx.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return true;
  });

  if (!wasFound) return notFound("Employee");

  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "DELETE",
    entity: "Employee",
    entityId: id,
    ipAddress: getClientIp(req),
  });

  return ok({ id }, "Employee deleted");
}
