/**
 * POST /api/kiosk/punch
 *
 * Device-token authenticated punch endpoint for Kiosk mode.
 *
 * Auth:  Authorization: Kiosk <deviceToken>
 *        (never an employee Bearer token — the kiosk authenticates the device,
 *        then verifies the employee via kioskPinHash or qrBadgeCode)
 *
 * Body:
 *   {
 *     employeeNumber: string,   // used to look up the employee
 *     pin:            string,   // kiosk PIN (4–8 digits, bcrypt-compared)
 *     punchType:      "IN"|"OUT",
 *     selfieKey?:     string,   // R2 key pre-uploaded by the device
 *     latitude?:      number,
 *     longitude?:     number,
 *   }
 *
 * Geofence violations are flagged but never rejected (Section 5.3).
 * Requires prior BIOMETRIC_SELFIE / GEOLOCATION consent when applicable.
 */
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { executePunch } from "@/lib/attendance/punch";
import { err, ok } from "@/lib/api-response";
import { isR2Configured } from "@/lib/r2";

const bodySchema = z.object({
  employeeNumber: z.string().min(1),
  pin:            z.string().length(6),
  punchType:      z.enum(["IN", "OUT"]),
  selfieKey:      z.string().optional().nullable(),
  // base64-encoded JPEG sent by the kiosk when R2 is not configured
  selfieData:     z.string().optional().nullable(),
  latitude:       z.number().min(-90).max(90).optional().nullable(),
  longitude:      z.number().min(-180).max(180).optional().nullable(),
});

/** Extract and validate the Kiosk device token from the Authorization header. */
async function getKiosk(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Kiosk ")) return null;
  const deviceToken = authHeader.slice(6).trim();
  if (!deviceToken) return null;

  // Device tokens are stored plaintext (they are not secret credentials —
  // they identify the device, not authenticate a person).
  const kiosk = await prismaAdmin.kiosk.findFirst({
    where: { deviceToken, isActive: true, deletedAt: null },
    select: { id: true, tenantId: true, requiresSelfie: true, branchId: true },
  });
  return kiosk ?? null;
}

export async function POST(req: NextRequest) {
  const kiosk = await getKiosk(req);
  if (!kiosk) return err("Invalid or inactive kiosk device token", 401);

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const d = parsed.data;

  // Selfie is ALWAYS required — must have selfieKey (R2) OR selfieData (base64 fallback)
  const hasSelfie = !!(d.selfieKey || d.selfieData);
  if (!hasSelfie) {
    return err("Selfie is required for kiosk punch", 422);
  }

  // Look up employee by employeeNumber within the kiosk's tenant
  const employee = await prismaAdmin.employee.findFirst({
    where: {
      tenantId:       kiosk.tenantId,
      employeeNumber: d.employeeNumber,
      deletedAt:      null,
    },
    select: { id: true, kioskPinHash: true, firstName: true, lastName: true },
  });
  if (!employee) return err("Employee not found", 404);
  if (!employee.kioskPinHash) return err("Kiosk PIN not set for this employee", 422);

  const pinOk = await bcrypt.compare(d.pin, employee.kioskPinHash);
  if (!pinOk) return err("Invalid PIN", 401);

  const result = await executePunch({
    tenantId:   kiosk.tenantId,
    employeeId: employee.id,
    punchType:  d.punchType,
    source:     "KIOSK",
    kioskId:    kiosk.id,
    selfieKey:  d.selfieKey ?? null,
    selfieData: d.selfieData ? Buffer.from(d.selfieData, "base64") : null,
    latitude:   d.latitude  ?? null,
    longitude:  d.longitude ?? null,
    ipAddress:  req.headers.get("x-forwarded-for") ?? null,
    userAgent:  req.headers.get("user-agent") ?? null,
  });

  if (!result.ok) {
    if (result.code === "NO_CONSENT")          return err("Employee has not granted biometric/location consent", 403);
    if (result.code === "EMPLOYEE_NOT_FOUND")  return err("Employee not found", 404);
    if (result.code === "DTR_LOCKED")          return err("DTR for this date is locked (payroll finalized)", 409);
  }

  return ok(
    {
      logId:           (result as Extract<typeof result, { ok: true }>).log.id,
      outsideGeofence: (result as Extract<typeof result, { ok: true }>).log.outsideGeofence,
      distanceMeters:  (result as Extract<typeof result, { ok: true }>).log.distanceMeters,
      dtrId:           (result as Extract<typeof result, { ok: true }>).dtr.id,
      employee: { firstName: employee.firstName, lastName: employee.lastName },
    },
    d.punchType === "IN" ? "Clocked in" : "Clocked out",
    201,
  );
}
