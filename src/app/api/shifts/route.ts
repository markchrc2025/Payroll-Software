/**
 * /api/shifts
 *   GET  — list shift schedules
 *   POST — create shift schedule
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  createShiftScheduleSchema,
  listShiftSchedulesSchema,
} from "@/lib/validations/dtr";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listShiftSchedulesSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { isActive, page, limit } = parsed.data;

  const where = {
    tenantId: auth.tenantId,
    deletedAt: null,
    ...(isActive !== undefined && { isActive }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.shiftSchedule.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.shiftSchedule.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createShiftScheduleSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const existing = await withTenant(auth.tenantId, (tx) =>
    tx.shiftSchedule.findFirst({
      where: { tenantId: auth.tenantId, name: d.name, deletedAt: null },
      select: { id: true },
    }),
  );
  if (existing) return err("Shift schedule name already exists", 409);

  const created = await withTenant(auth.tenantId, (tx) =>
    tx.shiftSchedule.create({
      data: {
        tenantId: auth.tenantId,
        name: d.name,
        type: d.type,
        timeIn: d.timeIn,
        timeOut: d.timeOut,
        breakMinutes: d.breakMinutes,
        breakPolicy: d.breakPolicy,
        crossesMidnight: d.crossesMidnight,
        workDays: d.workDays,
      },
    }),
  );

  return ok(created, "Shift schedule created", 201);
}
