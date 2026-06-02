/**
 * GET /api/attendance-logs/[id]
 *
 * Returns full details of a single attendance log for HR review.
 * Includes geolocation, selfie availability flag, kiosk, source, and audit fields.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

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

  // Build the response — expose hasSelfie instead of raw bytes/key for security
  const { selfieData, selfieKey, ...rest } = log;
  return ok({
    ...rest,
    latitude: log.latitude != null ? Number(log.latitude) : null,
    longitude: log.longitude != null ? Number(log.longitude) : null,
    hasSelfie: !!(selfieKey || selfieData),
  });
}
