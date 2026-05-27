/**
 * GET    /api/employees/[id]  — Get full employee detail
 * PUT    /api/employees/[id]  — Update employee fields
 * DELETE /api/employees/[id]  — Soft-delete (sets deletedAt)
 */

import type { NextRequest } from "next/server";
import { StatutoryIdType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { centavosToJson, toCentavos } from "@/lib/money";
import {
  ok,
  err,
  unauthorized,
  notFound,
} from "@/lib/api-response";
import { updateEmployeeSchema } from "@/lib/validations/employee";

// ---------------------------------------------------------------------------
// GET /api/employees/[id]
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params; // Next.js 16: params is a Promise

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      position: { select: { id: true, title: true, level: true } },
      statutoryIds: true,
      salaryHistory: {
        where: { endDate: null },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
    },
  });

  if (!employee) return notFound("Employee");

  // Serialise BigInt centavos for JSON safety
  const serialised = {
    ...employee,
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
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = updateEmployeeSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation failed", 422, parsed.error.flatten());

  // Ensure employee belongs to this tenant
  const existing = await prisma.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
  });
  if (!existing) return notFound("Employee");

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

  if (departmentId !== undefined && departmentId !== null) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!dept) return err("Department not found in your tenant", 404);
  }
  if (branchId !== undefined && branchId !== null) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!branch) return err("Branch not found in your tenant", 404);
  }
  if (positionId !== undefined && positionId !== null) {
    const pos = await prisma.position.findFirst({
      where: { id: positionId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!pos) return err("Position not found in your tenant", 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
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

    return emp;
  });

  return ok(updated, "Employee updated");
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
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  const existing = await prisma.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
  });
  if (!existing) return notFound("Employee");

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return ok({ id }, "Employee deleted");
}
