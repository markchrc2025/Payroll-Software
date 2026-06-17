/**
 * GET  /api/employees  — Paginated list with search & filters (tenant-scoped)
 * POST /api/employees  — Create a new employee + initial salary + placement + employment term records
 */

import type { NextRequest } from "next/server";
import { Prisma, StatutoryIdType } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { toCentavos, centavosToJson } from "@/lib/money";
import {
  ok,
  paginated,
  err,
} from "@/lib/api-response";
import {
  createEmployeeSchema,
  listEmployeesSchema,
} from "@/lib/validations/employee";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { claimEmployeeId } from "@/lib/claim-employee-id";

// ---------------------------------------------------------------------------
// GET /api/employees
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

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

  const [employees, total] = await withTenant(auth.tenantId, (tx) => Promise.all([
    tx.employee.findMany({
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
    tx.employee.count({ where }),
  ]));

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
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

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
    placementEffectiveDate,
    jobTitle,
    levelId,
    termEffectiveDate,
    jobTypeId,
    jobStatusId,
    leaveWorkflowKey,
    shiftScheduleId,
    holidayKey,
    contractStartDate,
    contractEndDate,
    ...rest
  } = parsed.data;

  // Create employee + initial salary + statutory IDs, plus all tenant-scoped
  // pre-checks, in a single tenant-scoped transaction.
  const result = await withTenant(auth.tenantId, async (tx) => {
    if (departmentId) {
      const dept = await tx.department.findFirst({
        where: { id: departmentId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!dept) return { error: "Department not found in your tenant" as const };
    }
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!branch) return { error: "Branch not found in your tenant" as const };
    }
    if (positionId) {
      const pos = await tx.position.findFirst({
        where: { id: positionId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!pos) return { error: "Position not found in your tenant" as const };
    }
    if (levelId) {
      const lvl = await tx.jobLevel.findFirst({
        where: { id: levelId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!lvl) return { error: "Level not found in your tenant" as const };
    }
    if (shiftScheduleId) {
      const sched = await tx.shiftSchedule.findFirst({
        where: { id: shiftScheduleId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!sched) return { error: "Shift schedule not found in your tenant" as const };
    }
    if (jobStatusId) {
      const status = await tx.jobStatus.findFirst({
        where: { id: jobStatusId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!status) return { error: "Job status not found in your tenant" as const };
    }

    // Atomically claim the next sequence number (SELECT ... FOR UPDATE on Tenant).
    const employeeNumber = await claimEmployeeId(tx, auth.tenantId);

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
        placementEffectiveDate: placementEffectiveDate ?? null,
        jobTitle:               jobTitle               ?? null,
        levelId:                levelId                ?? null,
        termEffectiveDate:      termEffectiveDate      ?? null,
        jobTypeId:              jobTypeId              ?? null,
        jobStatusId:            jobStatusId            ?? null,
        leaveWorkflowKey:       leaveWorkflowKey       ?? null,
        shiftScheduleId:        shiftScheduleId        ?? null,
        holidayKey:             holidayKey             ?? null,
        contractStartDate:      contractStartDate      ?? null,
        contractEndDate:        contractEndDate        ?? null,
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

    // Initial placement record (if wizard supplied placement data)
    const placementDate = placementEffectiveDate ?? hireDate;
    await tx.placement.create({
      data: {
        tenantId:      auth.tenantId,
        employeeId:    emp.id,
        effectiveDate: placementDate,
        positionId:    positionId    ?? null,
        jobTitle:      jobTitle      ?? null,
        lineManagerId: immediateSupervisorId ?? null,
        departmentId:  departmentId  ?? null,
        branchId:      branchId      ?? null,
        levelId:       levelId       ?? null,
      },
    });

    // Initial employment term record (if wizard supplied term data)
    const termDate = termEffectiveDate ?? hireDate;
    await tx.employmentTerm.create({
      data: {
        tenantId:         auth.tenantId,
        employeeId:       emp.id,
        effectiveDate:    termDate,
        jobTypeId:        jobTypeId        ?? null,
        jobStatusId:      jobStatusId      ?? null,
        leaveWorkflowKey: leaveWorkflowKey ?? null,
        shiftScheduleId:  shiftScheduleId  ?? null,
        holidayKey:       holidayKey       ?? null,
        termStart:        contractStartDate ?? null,
        nextReviewDate:   contractEndDate   ?? null,
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

    return { employee: emp };
  });

  if ("error" in result && result.error) return err(result.error, 404);

  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "CREATE",
    entity: "Employee",
    entityId: result.employee.id,
    ipAddress: getClientIp(req),
  });

  return ok(result.employee, "Employee created successfully", 201);
}

/** Convert empty / undefined strings to null for DB storage. */
function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}
