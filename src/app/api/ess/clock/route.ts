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
 *     selfieData?: string,  // base64 JPEG when object storage is unavailable
 *     latitude?:  number,
 *     longitude?: number,
 *   }
 *
 * Geofence violations are flagged but never rejected (Section 5.3 / 6.2).
 * Biometric / location consent is verified before accepting selfie or GPS.
 *
 * PAY-183: a selfie is required (Mark, 18 Nov 2026), as on the kiosk. When the
 * object store is not available the browser sends the photo itself
 * (selfieData) and it is kept on the punch, the kiosk's fallback.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { executePunch } from "@/lib/attendance/punch";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { atLocalWallClock, localDay, resolveTimezone } from "@/lib/time/zone";

const bodySchema = z.object({
  punchType: z.enum(["IN", "OUT"]),
  selfieKey: z.string().optional().nullable(),
  /** About 1.5 MB of JPEG at most once decoded. */
  selfieData: z.string().max(2_000_000).optional().nullable(),
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
  if (!d.selfieKey && !d.selfieData)
    return err("A selfie is required to clock in or out.", 422, { code: "SELFIE_REQUIRED" });

  const result = await executePunch({
    tenantId:   ess.tenantId,
    employeeId: ess.employeeId,
    punchType:  d.punchType,
    source:     "ESS",
    kioskId:    null,
    selfieKey:  d.selfieKey ?? null,
    selfieData: d.selfieData ? new Uint8Array(Buffer.from(d.selfieData, "base64")) : null,
    latitude:   d.latitude  ?? null,
    longitude:  d.longitude ?? null,
    ipAddress:  req.headers.get("x-forwarded-for") ?? null,
    userAgent:  req.headers.get("user-agent") ?? null,
  });

  if (!result.ok) {
    if (result.code === "NO_CONSENT")
      return err("Consent required for biometric/location capture", 403, { code: "CONSENT_REQUIRED" });
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
 *
 * PAY-189: the date is a local calendar day in the employee's time zone (the
 * same rule punches use), and "today" is worked out here. It used to be a UTC
 * day picked by the browser, so in Manila a clock-in before 8:00 AM fell on
 * the previous day and the home screen offered Clock In again.
 */
export async function GET(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const dateParam = new URL(req.url).searchParams.get("date");
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return err("date must be YYYY-MM-DD", 422);

  const logs = await withTenant(ess.tenantId, async (tx) => {
    const [tenant, emp] = await Promise.all([
      tx.tenant.findUnique({ where: { id: ess.tenantId }, select: { timezone: true, timekeepingTimezoneMode: true } }),
      tx.employee.findFirst({ where: { id: ess.employeeId, tenantId: ess.tenantId }, select: { timezone: true } }),
    ]);
    const tz = resolveTimezone(
      { timezone: tenant?.timezone ?? "Asia/Manila", timekeepingTimezoneMode: tenant?.timekeepingTimezoneMode ?? "COMPANY" },
      { timezone: emp?.timezone ?? null },
    );
    const day = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : localDay(new Date(), tz);
    const start = atLocalWallClock(day, "00:00", tz);
    const end = new Date(start.getTime() + 86_400_000);
    return tx.attendanceLog.findMany({
      where: {
        tenantId:   ess.tenantId,
        employeeId: ess.employeeId,
        punchedAt:  { gte: start, lt: end },
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
    });
  });

  return ok(logs);
}
