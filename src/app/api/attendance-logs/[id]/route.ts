/**
 * GET /api/attendance-logs/[id]
 *
 * Returns full details of a single attendance log for HR review.
 * Also returns all sibling punches for the same employee on the same date
 * and the DTR record for that day — used to power the two-tab attendance modal.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound, serverError } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  try {
    const log = await withTenant(auth.tenantId, (tx) =>
      tx.attendanceLog.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              department: { select: { name: true } },
              branch: { select: { name: true } },
            },
          },
          kiosk: { select: { id: true, name: true } },
        },
      })
    );

    if (!log) return notFound("Attendance log");

    // Date window for sibling punches + DTR: midnight–midnight on the punch date
    const punchDate = new Date(log.punchedAt);
    const dayStart = new Date(
      Date.UTC(punchDate.getUTCFullYear(), punchDate.getUTCMonth(), punchDate.getUTCDate())
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [siblingLogs, dtr] = await withTenant(auth.tenantId, (tx) =>
      Promise.all([
        // All punches for the same employee on the same calendar day
        tx.attendanceLog.findMany({
          where: {
            tenantId: auth.tenantId,
            employeeId: log.employeeId,
            punchedAt: { gte: dayStart, lt: dayEnd },
          },
          select: {
            id: true,
            punchType: true,
            source: true,
            punchedAt: true,
            outsideGeofence: true,
            distanceMeters: true,
            latitude: true,
            longitude: true,
            ipAddress: true,
            userAgent: true,
            selfieKey: true,
            selfieData: true,
            kiosk: { select: { id: true, name: true } },
          },
          orderBy: { punchedAt: "asc" },
        }),
        // DTR record for the same employee + day
        tx.dTRRecord.findFirst({
          where: {
            tenantId: auth.tenantId,
            employeeId: log.employeeId,
            date: { gte: dayStart, lt: dayEnd },
          },
        }),
      ])
    );

    // Build the primary log response — no raw bytes/key
    const { selfieData, selfieKey, ...rest } = log;

    return ok({
      ...rest,
      latitude: log.latitude != null ? Number(log.latitude) : null,
      longitude: log.longitude != null ? Number(log.longitude) : null,
      hasSelfie: !!(selfieKey || selfieData),
      // Sibling punches for the day (TIME CLOCK tab)
      dayPunches: siblingLogs.map(({ selfieData: sd, selfieKey: sk, latitude, longitude, ...p }) => ({
        ...p,
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        hasSelfie: !!(sk || sd),
      })),
      // DTR aggregate for the day (ATTENDANCE tab)
      dtr: dtr
        ? {
            id: dtr.id,
            date: dtr.date,
            dayStatus: dtr.dayStatus,
            workedMinutes: dtr.workedMinutes,
            lateMinutes: dtr.lateMinutes,
            undertimeMinutes: dtr.undertimeMinutes,
            otMinutes: dtr.otMinutes,
            officialTimeIn: dtr.officialTimeIn,
            officialTimeOut: dtr.officialTimeOut,
            effectiveTimeIn: dtr.effectiveTimeIn,
            effectiveTimeOut: dtr.effectiveTimeOut,
            approvalStatus: dtr.approvalStatus,
            isLocked: dtr.isLocked,
            notes: dtr.notes,
          }
        : null,
    });
  } catch (e) {
    return serverError(e);
  }
}
