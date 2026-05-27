/**
 * GET  /api/employees  — Paginated list with search & filters (tenant-scoped)
 * POST /api/employees  — Create a new employee + initial salary record
 */

import type { NextRequest } from "next/server";
import { Prisma, StatutoryIdType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { toCentavos, centavosToJson } from "@/lib/money";
import {
  ok,
  paginated,
  err,
  unauthorized,
} from "@/lib/api-response";
import {
  createEmployeeSchema,
  listEmployeesSchema,
} from "@/lib/validations/employee";

// ---------------------------------------------------------------------------
// GET /api/employees
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const params = listEmployeesSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!params.success) return err("Invalid query parameters", 400, params.error.flatten());

  const { page, limit, search, departmentId, branchId, status, employmentType } =
    params.data;

  // Build the WHERE clause — always scoped to the tenant (multi-tenancy)
  const where: Prisma.EmployeeWhereInput = {
    tenantId: auth.tenantId,
    deletedAt: null,
    ...(departmentId && { departmentId }),
    ...(branchId && { branchId }),
    ...(status && { employmentStatus: status }),
    ...(employmentType && { employmentType }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { employeeNumber: { contains: search, mode: "insensitive" } },
        { jobTitle: { contains: search, mode: "insensitive" } },
        { workEmail: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [employees, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        workEmail: true,
        mobileNumber: true,
        jobTitle: true,
        employmentStatus: true,
        employmentType: true,
        payFrequency: true,
        salaryType: true,
        hireDate: true,
        regularizationDate: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        position: { select: { id: true, title: true, level: true } },
        salaryHistory: {
          where: { endDate: null },
          orderBy: { effectiveDate: "desc" },
          take: 1,
          select: { basicSalaryCents: true, effectiveDate: true },
        },
      },
    }),
    prisma.employee.count({ where }),
  ]);

  // Serialise BigInt centavos to string for JSON safety.
  const serialised = employees.map((e) => ({
    ...e,
    salaryHistory: e.salaryHistory.map((s) => ({
      ...s,
      basicSalaryCents: centavosToJson(s.basicSalaryCents),
    })),
  }));

  return paginated(serialised, total, page, limit);
}

// ---------------------------------------------------------------------------
// POST /api/employees
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const {
    basicSalary,
    nontaxableBasicAmount,
    departmentId,
    branchId,
    positionId,
    immediateSupervisorId,
    managerId,
    hireDate,
    standardWorkHours,
    standardWorkDays,
    statutoryIds,
    ...rest
  } = parsed.data;

  // Validate department, branch, position belong to this tenant
  if (departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!dept) return err("Department not found in your tenant", 404);
  }
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!branch) return err("Branch not found in your tenant", 404);
  }
  if (positionId) {
    const pos = await prisma.position.findFirst({
      where: { id: positionId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!pos) return err("Position not found in your tenant", 404);
  }

  // Generate employee number: EMP-XXXX (padded, sequential per tenant)
  const lastEmployee = await prisma.employee.findFirst({
    where: { tenantId: auth.tenantId },
    orderBy: { createdAt: "desc" },
    select: { employeeNumber: true },
  });
  const nextNum = lastEmployee
    ? parseInt(lastEmployee.employeeNumber.replace(/\D/g, ""), 10) + 1
    : 1;
  const employeeNumber = `EMP-${String(nextNum).padStart(4, "0")}`;

  // Create employee + initial salary + statutory IDs in a transaction
  const employee = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.create({
      data: {
        ...rest,
        tenantId: auth.tenantId,
        employeeNumber,
        departmentId: departmentId ?? null,
        branchId: branchId ?? null,
        positionId: positionId ?? null,
        immediateSupervisorId: immediateSupervisorId ?? null,
        managerId: managerId ?? null,
        nontaxableBasicAmountCents: toCentavos(nontaxableBasicAmount ?? 0),
        hireDate,
        standardWorkHours: standardWorkHours.toString(),
        standardWorkDays: standardWorkDays.toString(),
      },
    });

    // Opening salary record (effective from hire date)
    await tx.employeeSalary.create({
      data: {
        employeeId: emp.id,
        tenantId: auth.tenantId,
        basicSalaryCents: toCentavos(basicSalary),
        salaryType: emp.salaryType,
        effectiveDate: hireDate,
        reason: "Initial hire",
        createdByUserId: auth.userId,
      },
    });

    // Normalised StatutoryId rows — one row per (employee, type)
    const rows: { type: StatutoryIdType; value: string | null }[] = [
      { type: StatutoryIdType.TIN, value: emptyToNull(statutoryIds?.tinNumber) },
      { type: StatutoryIdType.SSS, value: emptyToNull(statutoryIds?.sssNumber) },
      { type: StatutoryIdType.PHILHEALTH, value: emptyToNull(statutoryIds?.philhealthNumber) },
      { type: StatutoryIdType.PAGIBIG, value: emptyToNull(statutoryIds?.pagibigNumber) },
      { type: StatutoryIdType.GSIS, value: emptyToNull(statutoryIds?.gsisMembershipId) },
    ];
    for (const r of rows) {
      if (r.value == null) continue;
      await tx.statutoryId.create({
        data: {
          employeeId: emp.id,
          tenantId: auth.tenantId,
          type: r.type,
          number: r.value,
        },
      });
    }

    return emp;
  });

  return ok(employee, "Employee created successfully", 201);
}

/** Convert empty / undefined strings to null for DB storage. */
function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}
