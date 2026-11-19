/**
 * POST /api/payroll/runs/[id]/discard (PAY-192)
 *
 * Deletes a run stuck in PROCESSING with no live job, so the cutoff can be
 * run again. A PROCESSING run has no sheets: its compute is one transaction.
 * Refused (409) while its job is still waiting or running, and for any run
 * that is not PROCESSING (drafts are recomputed, finalized runs are sealed).
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, ok, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { hasLivePayrollJob } from "@/lib/jobs/workers";
import { discardStuckRun, stuckRunMessage } from "@/lib/jobs/stuck-runs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "PAYROLL", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;
  try {
    const r = await withTenant(auth.tenantId, (tx) => discardStuckRun(tx, auth.tenantId, id, { hasLiveJob: hasLivePayrollJob }));
    if (!r.ok) {
      const m = stuckRunMessage(r);
      return err(m.message, m.status);
    }
    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "DELETE",
      entity: "PayrollBook",
      entityId: id,
      changes: { action: "discard_stuck_run" },
    });
    return ok({ id }, "The stuck run was discarded. You can create the run for this cutoff again.");
  } catch (e) {
    return serverError(e);
  }
}
