/**
 * The approved overtime of an OT application, written onto the day's DTR
 * (after the shift's OT break rule). Shared by HR's approve route and the ESS
 * Team requests approval (PAY-191 part 2), so both write the same minutes.
 * With no DTR for the day yet, a placeholder row carries the minutes and a
 * later punch or import fills in the rest of the day.
 */
import type { TenantTx } from "@/lib/with-tenant";
import { applyOtBreakRule } from "@/lib/attendance/ot-policy";

const OT_POLICY_SELECT = {
  otBreakMode:         true,
  otBreakTriggerHours: true,
  otBreakBlockHours:   true,
  otBreakMinutes:      true,
} as const;

export async function writeOtMinutes(
  tx: TenantTx,
  tenantId: string,
  ota: { employeeId: string; date: Date; hours: { toString(): string } },
) {
  const otAssignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      tenantId,
      employeeId:    ota.employeeId,
      effectiveFrom: { lte: ota.date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ota.date } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { shiftSchedule: { select: OT_POLICY_SELECT } },
  });
  let otShift = otAssignment?.shiftSchedule ?? null;
  if (!otShift) {
    const emp = await tx.employee.findFirst({
      where: { id: ota.employeeId, tenantId },
      select: { shiftSchedule: { select: OT_POLICY_SELECT } },
    });
    otShift = emp?.shiftSchedule ?? null;
  }

  const rawOtMinutes = Math.round(Number(ota.hours) * 60);
  const otMinutes = otShift ? applyOtBreakRule(rawOtMinutes, otShift) : rawOtMinutes;

  await tx.dTRRecord.upsert({
    where: { tenantId_employeeId_date: { tenantId, employeeId: ota.employeeId, date: ota.date } },
    update: { otMinutes },
    create: { tenantId, employeeId: ota.employeeId, date: ota.date, dayStatus: "REST_DAY", otMinutes },
  });
}
