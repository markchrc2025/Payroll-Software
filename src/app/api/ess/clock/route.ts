/**
 * POST /api/ess/clock
 *
 * ESS clock-in / clock-out for authenticated employees.
 *
 * Auth:  ESS Bearer token (getEssContext)
 *
 * Body:
 *   {
 *     punchType:  "IN" | "OUT",
 *     selfieKey?: string,   // R2 key pre-uploaded by the browser/app
 *     latitude?:  number,
 *     longitude?: number,
 *   }
 *
 * Geofence violations are flagged but never rejected (Section 5.3 / 6.2).
 * Biometric / location consent is verified before accepting selfie or GPS.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { executePunch } from "@/lib/attendance/punch";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

const bodySchema = z.object({
  punchType: z.enum(["IN", "OUT"]),
  selfieKey: z.string().optional().nullable(),
  latitude:  z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await executePunch({
    tenantId:   ess.tenantId,
    employeeId: ess.employeeId,
    punchType:  d.punchType,
    source:     "ESS",
    kioskId:    null,
    selfieKey:  d.selfieKey ?? null,
    latitude:   d.latitude  ?? null,
    longitude:  d.longitude ?? null,
    ipAddress:  req.headers.get("x-forwarded-for") ?? null,
    userAgent:  req.headers.get("user-agent") ?? null,
  });

  if (!result.ok) {
    if (result.code === "NO_CONSENT")         return err("Consent required for biometric/location capture", 403);
    if (result.code === "EMPLOYEE_NOT_FOUND") return err("Employee record not found", 404);
    if (result.code === "DTR_LOCKED")         return err("DTR for this date is locked (payroll finalized)", 409);
  }

  return ok(
    {
      logId:           (result as Extract<typeof result, { ok: true }>).log.id,
      outsideGeofence: (result as Extract<typeof result, { ok: true }>).log.outsideGeofence,
      distanceMeters:  (result as Extract<typeof result, { ok: true }>).log.distanceMeters,
      dtrId:           (result as Extract<typeof result, { ok: true }>).dtr.id,
    },
    d.punchType === "IN" ? "Clocked in" : "Clocked out",
    201,
  );
}

/**
 * GET /api/ess/clock?date=YYYY-MM-DD
 *
 * Returns the employee's AttendanceLogs for the given date (defaults to today).
 */
export async function GET(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const dateParam = new URL(req.url).searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const startOfDay = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0));
  const endOfDay   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999));

  const logs = await withTenant(ess.tenantId, (tx) =>
    tx.attendanceLog.findMany({
      where: {
        tenantId:   ess.tenantId,
        employeeId: ess.employeeId,
        punchedAt:  { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { punchedAt: "asc" },
      select: {
        id:             true,
        punchType:      true,
        punchedAt:      true,
        source:         true,
        latitude:       true,
        longitude:      true,
        outsideGeofence: true,
        distanceMeters:  true,
      },
    }),
  );

  return ok(logs);
}
