/**
 * src/lib/dtr/submission-guard.ts
 *
 * A DTR period cannot be submitted while it still has unresolved attendance
 * filings: pending OT applications, pending undertime requests, or pending
 * leave requests overlapping the period. Forcing these to be approved/rejected
 * first guarantees the period is final before it enters the payroll pipeline
 * (unapproved DTR rows are already excluded by the aggregator).
 */
import type { TenantTx } from "@/lib/with-tenant";

export interface SubmissionBlocker {
  type: "OT" | "UNDERTIME" | "LEAVE";
  count: number;
}

/**
 * Returns the list of pending filings blocking submission of [start, end].
 * Empty array → the period is clear to submit.
 */
export async function findSubmissionBlockers(
  tx: TenantTx,
  tenantId: string,
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SubmissionBlocker[]> {
  const [otCount, utCount, leaveCount] = await Promise.all([
    tx.oTApplication.count({
      where: {
        tenantId,
        employeeId,
        status: "PENDING",
        date: { gte: periodStart, lte: periodEnd },
      },
    }),
    tx.undertimeRequest.count({
      where: {
        tenantId,
        employeeId,
        status: "PENDING",
        date: { gte: periodStart, lte: periodEnd },
      },
    }),
    tx.leaveTransaction.count({
      where: {
        tenantId,
        employeeId,
        type: "USAGE",
        approvalStatus: "PENDING",
        // Overlaps the period.
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
    }),
  ]);

  const blockers: SubmissionBlocker[] = [];
  if (otCount > 0) blockers.push({ type: "OT", count: otCount });
  if (utCount > 0) blockers.push({ type: "UNDERTIME", count: utCount });
  if (leaveCount > 0) blockers.push({ type: "LEAVE", count: leaveCount });
  return blockers;
}

/** Human-readable summary for an error message. */
export function describeBlockers(blockers: SubmissionBlocker[]): string {
  const label: Record<SubmissionBlocker["type"], string> = {
    OT: "overtime application(s)",
    UNDERTIME: "undertime request(s)",
    LEAVE: "leave request(s)",
  };
  return blockers.map((b) => `${b.count} pending ${label[b.type]}`).join(", ");
}
