/**
 * src/lib/attendance/punch.ts
 *
 * Shared core punch logic — called by both the Kiosk route (device-token auth)
 * and the ESS clock route (bearer-token auth).
 *
 * Flow for each punch:
 *  1. Verify biometric/location consent (if selfie or GPS is provided).
 *  2. Compute geofence status (flagged but never blocked).
 *  3. Write AttendanceLog row.
 *  4. Fetch the employee's active ShiftSchedule for the punch date.
 *  5. Load all AttendanceLogs for that employee+date, compute DTR fields.
 *  6. Upsert DTRRecord (create if missing, update if not locked).
 */
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { checkGeofence } from "@/lib/attendance/geofence";
import { computeDtrFields } from "@/lib/attendance/compute-dtr";

export type PunchSource = "KIOSK" | "ESS" | "IMPORT" | "MANUAL";
export type PunchType   = "IN" | "OUT";

export interface PunchInput {
  tenantId:   string;
  employeeId: string;
  punchType:  PunchType;
  source:     PunchSource;
  kioskId?:   string | null;
  selfieKey?:  string | null;
  selfieData?: Buffer | null;
  latitude?:  number | null;
  longitude?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type PunchResult =
  | { ok: true;  log: { id: string; outsideGeofence: boolean; distanceMeters: number | null }; dtr: { id: string } }
  | { ok: false; code: "NO_CONSENT" | "EMPLOYEE_NOT_FOUND" | "DTR_LOCKED" };

/**
 * Execute a clock punch and auto-compute the DTRRecord for the punch date.
 */
export async function executePunch(input: PunchInput): Promise<PunchResult> {
  const now = new Date();
  // Calendar date in UTC midnight for the punch
  const punchDate = new Date(now);
  punchDate.setUTCHours(0, 0, 0, 0);

  return withTenant(input.tenantId, async (tx) => {
    // 1. Verify employee exists
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (!employee) return { ok: false, code: "EMPLOYEE_NOT_FOUND" };

    // 2. Consent check — if selfie or GPS provided, employee must have granted consent
    if (input.selfieKey || input.selfieData || (input.latitude != null && input.longitude != null)) {
      const checks: { types: string[] }[] = [];
      if (input.selfieKey || input.selfieData) {
        checks.push({ types: ["BIOMETRIC_SELFIE", "KIOSK_PHOTO"] });
      }
      if (input.latitude != null && input.longitude != null) {
        checks.push({ types: ["GEOLOCATION"] });
      }

      for (const check of checks) {
        const hasConsent = await tx.consentRecord.findFirst({
          where: {
            tenantId:   input.tenantId,
            employeeId: input.employeeId,
            type:       { in: check.types as ("BIOMETRIC_SELFIE" | "GEOLOCATION" | "KIOSK_PHOTO" | "DATA_PROCESSING" | "MARKETING")[] },
            granted:    true,
            revokedAt:  null,
          },
          select: { id: true },
        });
        if (!hasConsent) return { ok: false, code: "NO_CONSENT" as const };
      }
    }

    // 3. Geofence check — only if GPS provided and branch has a geofence
    let geofenceResult = { outsideGeofence: false, distanceMeters: null as number | null };
    if (input.latitude != null && input.longitude != null && employee.branchId) {
      const geofence = await tx.geofence.findFirst({
        where: {
          branchId:  employee.branchId,
          tenantId:  input.tenantId,
          isActive:  true,
          deletedAt: null,
        },
        select: { latitude: true, longitude: true, radiusMeters: true },
      });
      geofenceResult = checkGeofence(input.latitude, input.longitude, geofence);
    }

    // 4. Write AttendanceLog
    const log = await tx.attendanceLog.create({
      data: {
        tenantId:        input.tenantId,
        employeeId:      input.employeeId,
        kioskId:         input.kioskId ?? null,
        punchType:       input.punchType,
        source:          input.source,
        punchedAt:       now,
        selfieKey:       input.selfieKey  ?? null,
        selfieData:      input.selfieData  ?? null,
        latitude:        input.latitude  != null ? input.latitude  : null,
        longitude:       input.longitude != null ? input.longitude : null,
        outsideGeofence: geofenceResult.outsideGeofence,
        distanceMeters:  geofenceResult.distanceMeters,
        ipAddress:       input.ipAddress ?? null,
        userAgent:       input.userAgent ?? null,
      },
      select: { id: true, outsideGeofence: true, distanceMeters: true },
    });

    // 5. Find the employee's active shift for the punch date
    const shiftAssignment = await tx.employeeShiftAssignment.findFirst({
      where: {
        tenantId:     input.tenantId,
        employeeId:   input.employeeId,
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: punchDate } },
        ],
      },
      orderBy: { effectiveFrom: "desc" },
      select: {
        shiftSchedule: {
          select: {
            id:             true,
            timeIn:         true,
            timeOut:        true,
            breakMinutes:   true,
            crossesMidnight: true,
          },
        },
      },
    });
    const shift = shiftAssignment?.shiftSchedule ?? null;

    // 6. Load all punches for this employee on this calendar date
    const dayStart = new Date(punchDate);
    const dayEnd   = new Date(punchDate.getTime() + 86_400_000);
    const allPunches = await tx.attendanceLog.findMany({
      where: {
        tenantId:  input.tenantId,
        employeeId: input.employeeId,
        punchedAt: { gte: dayStart, lt: dayEnd },
      },
      select: { punchType: true, punchedAt: true },
    });

    const computed = computeDtrFields(
      punchDate,
      allPunches.map((p) => ({
        punchType: p.punchType as PunchType,
        punchedAt: p.punchedAt,
      })),
      shift,
    );

    // 7. Upsert DTRRecord — skip if locked (payroll finalized)
    const existingDtr = await tx.dTRRecord.findUnique({
      where: {
        tenantId_employeeId_date: {
          tenantId:   input.tenantId,
          employeeId: input.employeeId,
          date:       punchDate,
        },
      },
      select: { id: true, isLocked: true },
    });

    if (existingDtr?.isLocked) {
      return { ok: false, code: "DTR_LOCKED" };
    }

    const dtrData: Prisma.DTRRecordCreateInput = {
      tenant:          { connect: { id: input.tenantId } },
      employee:        { connect: { id: input.employeeId } },
      date:            punchDate,
      shiftSchedule:   shift ? { connect: { id: shift.id } } : undefined,
      dayStatus:       computed.dayStatus,
      workedMinutes:   computed.workedMinutes,
      lateMinutes:     computed.lateMinutes,
      undertimeMinutes: computed.undertimeMinutes,
      nsdMinutes:      computed.nsdMinutes,
    };

    const dtr = existingDtr
      ? await tx.dTRRecord.update({
          where: { id: existingDtr.id },
          data: {
            dayStatus:        computed.dayStatus,
            workedMinutes:    computed.workedMinutes,
            lateMinutes:      computed.lateMinutes,
            undertimeMinutes: computed.undertimeMinutes,
            nsdMinutes:       computed.nsdMinutes,
            ...(shift && { shiftScheduleId: shift.id }),
          },
          select: { id: true },
        })
      : await tx.dTRRecord.create({ data: dtrData, select: { id: true } });

    return { ok: true, log, dtr };
  });
}
