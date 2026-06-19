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
import { withTenant } from "@/lib/with-tenant";
import { checkGeofence } from "@/lib/attendance/geofence";
import { computeDtrFields } from "@/lib/attendance/compute-dtr";
import { applyOtBreakRule } from "@/lib/attendance/ot-policy";
import { getOrSet } from "@/lib/cache/cache";
import { CacheKeys, TTL } from "@/lib/cache/keys";

export type PunchSource = "KIOSK" | "ESS" | "IMPORT" | "MANUAL";
export type PunchType   = "IN" | "OUT";

export interface PunchInput {
  tenantId:   string;
  employeeId: string;
  punchType:  PunchType;
  source:     PunchSource;
  kioskId?:   string | null;
  selfieKey?:  string | null;
  selfieData?: Uint8Array<ArrayBuffer> | null;
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
      select: { id: true, branchId: true, shiftScheduleId: true },
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
      const geofence = await getOrSet(
        CacheKeys.geofence(input.tenantId, employee.branchId),
        TTL.GEOFENCE,
        () =>
          tx.geofence.findFirst({
            where: {
              branchId:  employee.branchId!,
              tenantId:  input.tenantId,
              isActive:  true,
              deletedAt: null,
            },
            select: { latitude: true, longitude: true, radiusMeters: true },
          }),
      );
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

    // 5. Find the employee's active shift for the punch date.
    //    Priority: (1) EmployeeShiftAssignment (effective-dated) → (2) Employee.shiftScheduleId fallback.
    const SHIFT_SELECT = {
      id:                  true,
      timeIn:              true,
      timeOut:             true,
      coreTimeIn:          true,
      coreTimeOut:         true,
      requiredHours:       true,
      gracePeriodMinutes:  true,
      breakMinutes:        true,
      breakPolicy:         true,
      crossesMidnight:     true,
      otThresholdMinutes:  true,
      otAutoApprove:       true,
      otBreakMode:         true,
      otBreakTriggerHours: true,
      otBreakBlockHours:   true,
      otBreakMinutes:      true,
    } as const;

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
      select: { shiftSchedule: { select: SHIFT_SELECT } },
    });

    let shift = shiftAssignment?.shiftSchedule ?? null;

    // Fallback: no EmployeeShiftAssignment found — use Employee.shiftScheduleId directly.
    if (!shift && employee.shiftScheduleId) {
      shift = await tx.shiftSchedule.findFirst({
        where: { id: employee.shiftScheduleId, deletedAt: null },
        select: SHIFT_SELECT,
      });
    }

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
      shift
        ? {
            timeIn:             shift.timeIn             ?? null,
            timeOut:            shift.timeOut            ?? null,
            coreTimeIn:         shift.coreTimeIn         ?? null,
            coreTimeOut:        shift.coreTimeOut        ?? null,
            requiredHours:      shift.requiredHours      ?? null,
            gracePeriodMinutes: shift.gracePeriodMinutes ?? 0,
            breakMinutes:       shift.breakMinutes       ?? 60,
            breakPolicy:        shift.breakPolicy        ?? "FIXED_DEDUCTION",
            crossesMidnight:    shift.crossesMidnight    ?? false,
            otThresholdMinutes: shift.otThresholdMinutes ?? null,
          }
        : null,
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

    // Overtime is never paid from the threshold alone. The threshold only
    // *suggests* OT (advisory). Paid OT comes solely from an approved OT
    // application. When the shift opts into auto-approve, create one here.
    const suggestedOtMinutes = computed.suggestedOtMinutes ?? 0;
    let autoApprovedOtMinutes: number | null = null;
    if (shift?.otAutoApprove && suggestedOtMinutes > 0) {
      const existingOtApp = await tx.oTApplication.findFirst({
        where: {
          tenantId:   input.tenantId,
          employeeId: input.employeeId,
          date:       punchDate,
          status:     { in: ["PENDING", "APPROVED"] },
        },
        select: { id: true },
      });
      if (!existingOtApp) {
        const payable = applyOtBreakRule(suggestedOtMinutes, {
          otBreakMode:         shift.otBreakMode,
          otBreakTriggerHours: shift.otBreakTriggerHours,
          otBreakBlockHours:   shift.otBreakBlockHours,
          otBreakMinutes:      shift.otBreakMinutes,
        });
        if (payable > 0) {
          await tx.oTApplication.create({
            data: {
              tenantId:      input.tenantId,
              employeeId:    input.employeeId,
              date:          punchDate,
              hours:         (payable / 60).toFixed(2),
              justification: "Auto-approved: worked beyond scheduled hours.",
              status:        "APPROVED",
              approvedAt:    now,
            },
          });
          autoApprovedOtMinutes = payable;
        }
      }
    }

    const dtr = existingDtr
      ? await tx.dTRRecord.update({
          where: { id: existingDtr.id },
          data: {
            dayStatus:          computed.dayStatus,
            workedMinutes:      computed.workedMinutes,
            lateMinutes:        computed.lateMinutes,
            undertimeMinutes:   computed.undertimeMinutes,
            nsdMinutes:         computed.nsdMinutes,
            suggestedOtMinutes,
            ...(shift && { shiftScheduleId: shift.id }),
            // Paid OT only changes here when this punch just auto-approved it.
            ...(autoApprovedOtMinutes !== null && { otMinutes: autoApprovedOtMinutes }),
          },
          select: { id: true },
        })
      : await tx.dTRRecord.create({
          data: {
            tenant:             { connect: { id: input.tenantId } },
            employee:           { connect: { id: input.employeeId } },
            date:               punchDate,
            shiftSchedule:      shift ? { connect: { id: shift.id } } : undefined,
            dayStatus:          computed.dayStatus,
            workedMinutes:      computed.workedMinutes,
            lateMinutes:        computed.lateMinutes,
            undertimeMinutes:   computed.undertimeMinutes,
            nsdMinutes:         computed.nsdMinutes,
            suggestedOtMinutes,
            otMinutes:          autoApprovedOtMinutes ?? 0,
          },
          select: { id: true },
        });

    return { ok: true, log, dtr };
  });
}
