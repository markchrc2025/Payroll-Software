/**
 * /api/period-inputs
 *   GET  — list (filter: employeeId, periodStart, periodEnd)
 *   POST — upsert one (employee × period) row
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  listPeriodInputsSchema,
  upsertPeriodInputSchema,
} from "@/lib/validations/period-input";
import { serializePeriodInput } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listPeriodInputsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { employeeId, periodStart, periodEnd, page, limit } = parsed.data;

  const where: Prisma.PeriodInputWhereInput = {
    tenantId: auth.tenantId,
    ...(employeeId && { employeeId }),
    ...(periodStart && { periodStart: { gte: periodStart } }),
    ...(periodEnd && { periodEnd: { lte: periodEnd } }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.periodInput.findMany({
        where,
        orderBy: [{ periodStart: "desc" }, { employeeId: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.periodInput.count({ where }),
    ]),
  );

  return paginated(rows.map(serializePeriodInput), total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = upsertPeriodInputSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: d.employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return null;

    return tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: auth.tenantId,
          employeeId: d.employeeId,
          periodStart: d.periodStart,
          periodEnd: d.periodEnd,
        },
      },
      create: {
        tenantId: auth.tenantId,
        employeeId: d.employeeId,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        daysWorked: d.daysWorked,
        lateUndertimeMinutes: d.lateUndertimeMinutes,
        regularOtHours: d.regularOtHours,
        restDayHours: d.restDayHours,
        specialHolidayHours: d.specialHolidayHours,
        regularHolidayHours: d.regularHolidayHours,
        nightDiffHours: d.nightDiffHours,
        hazardHours: d.hazardHours,
        unpaidLeaveDays: d.unpaidLeaveDays,
        notes: d.notes ?? null,
      },
      update: {
        daysWorked: d.daysWorked,
        lateUndertimeMinutes: d.lateUndertimeMinutes,
        regularOtHours: d.regularOtHours,
        restDayHours: d.restDayHours,
        specialHolidayHours: d.specialHolidayHours,
        regularHolidayHours: d.regularHolidayHours,
        nightDiffHours: d.nightDiffHours,
        hazardHours: d.hazardHours,
        unpaidLeaveDays: d.unpaidLeaveDays,
        notes: d.notes ?? null,
      },
    });
  });

  if (!result) return notFound("Employee");
  return ok(serializePeriodInput(result), "PeriodInput saved", 200);
}
