/**
 * GET    /api/employees/[id]  — Get full employee detail
 * PUT    /api/employees/[id]  — Update employee fields
 * DELETE /api/employees/[id]  — Soft-delete (sets deletedAt)
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import {
  ok,
  err,
  unauthorized,
  notFound,
  serverError,
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
    where: { id, companyId: auth.companyId, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      statutoryIds: true,
      salaryHistory: {
        where: { endDate: null },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
    },
  });

  if (!employee) return notFound("Employee");

  return ok(employee);
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

  // Ensure employee belongs to this company
  const existing = await prisma.employee.findFirst({
    where: { id, companyId: auth.companyId, deletedAt: null },
  });
  if (!existing) return notFound("Employee");

  // Validate dept / branch if being changed
  const { departmentId, branchId, standardWorkHours, standardWorkDays, ...rest } =
    parsed.data;

  if (departmentId !== undefined && departmentId !== null) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, companyId: auth.companyId, deletedAt: null },
    });
    if (!dept) return err("Department not found in your company", 404);
  }
  if (branchId !== undefined && branchId !== null) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, companyId: auth.companyId, deletedAt: null },
    });
    if (!branch) return err("Branch not found in your company", 404);
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...rest,
      ...(departmentId !== undefined && { departmentId }),
      ...(branchId !== undefined && { branchId }),
      ...(standardWorkHours !== undefined && {
        standardWorkHours: standardWorkHours.toString(),
      }),
      ...(standardWorkDays !== undefined && {
        standardWorkDays: standardWorkDays.toString(),
      }),
    },
  });

  return ok(updated, "Employee updated");
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
    where: { id, companyId: auth.companyId, deletedAt: null },
  });
  if (!existing) return notFound("Employee");

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return ok({ id }, "Employee deleted");
}
