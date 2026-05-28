/**
 * /api/dtr
 *   GET  — list DTR records (filter: employeeId, dateFrom, dateTo, approvalStatus)
 *   POST — create/upsert a DTR record
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  createDtrRecordSchema,
  listDtrRecordsSchema,
} from "@/lib/validations/dtr";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listDtrRecordsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { employeeId, dateFrom, dateTo, approvalStatus, page, limit } =
    parsed.data;

  const where: Prisma.DTRRecordWhereInput = {
    tenantId: auth.tenantId,
    ...(employeeId && { employeeId }),
    ...(approvalStatus && { approvalStatus }),
    ...((dateFrom || dateTo) && {
      date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59.999Z") }),
      },
    }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.dTRRecord.findMany({
        where,
        orderBy: [{ employeeId: "asc" }, { date: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.dTRRecord.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createDtrRecordSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: d.employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return "NOT_FOUND_EMP";

    if (d.shiftScheduleId) {
      const shift = await tx.shiftSchedule.findFirst({
        where: {
          id: d.shiftScheduleId,
          tenantId: auth.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!shift) return "NOT_FOUND_SHIFT";
    }

    const date = new Date(d.date + "T00:00:00.000Z");

    return tx.dTRRecord.upsert({
      where: {
        tenantId_employeeId_date: {
          tenantId: auth.tenantId,
          employeeId: d.employeeId,
          date,
        },
      },
      create: {
        tenantId: auth.tenantId,
        employeeId: d.employeeId,
        date,
        shiftScheduleId: d.shiftScheduleId ?? null,
        dayStatus: d.dayStatus,
        workedMinutes: d.workedMinutes,
        lateMinutes: d.lateMinutes,
        undertimeMinutes: d.undertimeMinutes,
        otMinutes: d.otMinutes,
        nsdMinutes: d.nsdMinutes,
        hazardMinutes: d.hazardMinutes,
        holidayType: d.holidayType ?? null,
        notes: d.notes ?? null,
      },
      update: {
        shiftScheduleId: d.shiftScheduleId ?? null,
        dayStatus: d.dayStatus,
        workedMinutes: d.workedMinutes,
        lateMinutes: d.lateMinutes,
        undertimeMinutes: d.undertimeMinutes,
        otMinutes: d.otMinutes,
        nsdMinutes: d.nsdMinutes,
        hazardMinutes: d.hazardMinutes,
        holidayType: d.holidayType ?? null,
        notes: d.notes ?? null,
      },
    });
  });

  if (result === "NOT_FOUND_EMP") return notFound();
  if (result === "NOT_FOUND_SHIFT") return err("Shift schedule not found", 404);

  return ok(result, "DTR record saved", 201);
}
