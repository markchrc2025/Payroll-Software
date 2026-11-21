/**
 * Wave G3 (PAY-217): what an incident's decision does once it is resolved.
 *
 *   Suspension of N days: N scheduled workdays from the start date HR picks
 *   are written as approved UNPAID_LEAVE DTR days tagged with the incident,
 *   so payroll reads them as unpaid days (dtr-aggregate). A day already in a
 *   finalized run (locked), or one the employee worked, refuses the whole
 *   suspension: HR picks another start date.
 *   Dismissal: an offboarding case opens (separation reason JUST_CAUSE, last
 *   working day as HR enters it), with the company's clearance checklist.
 *
 * Outcomes apply once: resolving or closing the incident again does not write
 * them a second time.
 */
import type { Prisma } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { resolveSchedule } from "@/lib/leave/apply-to-dtr";
import { openCase } from "@/lib/offboarding/clearance";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export class IncidentOutcomeError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/** The next `days` scheduled workdays from `start` (inclusive). */
export async function suspensionWorkdays(tx: TenantTx, tenantId: string, employeeId: string, start: Date, days: number): Promise<Date[]> {
  const { workDays } = await resolveSchedule(tx, tenantId, employeeId, start);
  if (!workDays.length) throw new IncidentOutcomeError("The employee has no scheduled workdays.");
  const out: Date[] = [];
  const d = new Date(start); d.setUTCHours(0, 0, 0, 0);
  while (out.length < days) {
    if ((workDays as string[]).includes(DOW[d.getUTCDay()]!)) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface OutcomeInput { suspensionStartDate?: Date | null; lastWorkingDay?: Date | null }

export async function applyOutcomes(
  tx: TenantTx,
  tenantId: string,
  userId: string | null,
  incident: { id: string; employeeId: string; subject: string; decisionSuspensionDays: number | null; decisionIsDismissal: boolean; suspensionDates: Prisma.JsonValue | null; offboardingCaseId: string | null },
  input: OutcomeInput,
) {
  const data: Prisma.IncidentReportUpdateInput = {};
  const result: { suspensionDates: string[] | null; offboardingCaseId: string | null } = { suspensionDates: null, offboardingCaseId: null };

  if (incident.decisionSuspensionDays && !incident.suspensionDates) {
    if (!input.suspensionStartDate) throw new IncidentOutcomeError("Enter the first day of the suspension.");
    const dates = await suspensionWorkdays(tx, tenantId, incident.employeeId, input.suspensionStartDate, incident.decisionSuspensionDays);
    const existing = await tx.dTRRecord.findMany({ where: { tenantId, employeeId: incident.employeeId, date: { in: dates } } });
    const blocked = existing.filter((r) => r.isLocked || r.workedMinutes > 0);
    if (blocked.length) {
      throw new IncidentOutcomeError(`These days are already paid or worked: ${blocked.map((r) => iso(r.date)).join(", ")}. Pick another start date.`, 409);
    }
    const notes = `Suspension: ${incident.subject}`;
    for (const d of dates) {
      const row = existing.find((r) => r.date.getTime() === d.getTime());
      if (row) {
        await tx.dTRRecord.update({ where: { id: row.id }, data: { dayStatus: "UNPAID_LEAVE", paidLeaveMinutes: 0, leaveTransactionId: null, incidentReportId: incident.id, approvalStatus: "APPROVED", notes } });
      } else {
        await tx.dTRRecord.create({ data: { tenantId, employeeId: incident.employeeId, date: d, dayStatus: "UNPAID_LEAVE", incidentReportId: incident.id, approvalStatus: "APPROVED", notes } });
      }
    }
    result.suspensionDates = dates.map(iso);
    data.suspensionStartDate = input.suspensionStartDate;
    data.suspensionDates = result.suspensionDates;
  }

  if (incident.decisionIsDismissal && !incident.offboardingCaseId) {
    if (!input.lastWorkingDay) throw new IncidentOutcomeError("Enter the dismissed employee's last working day.");
    const c = await openCase(tx, tenantId, {
      employeeId: incident.employeeId, separationReason: "JUST_CAUSE", lastWorkingDay: input.lastWorkingDay,
      createdByUserId: userId, notes: `Dismissal: ${incident.subject}`,
    });
    result.offboardingCaseId = c.id;
    data.offboardingCaseId = c.id;
  }

  if (Object.keys(data).length) await tx.incidentReport.update({ where: { id: incident.id }, data });
  return result;
}
