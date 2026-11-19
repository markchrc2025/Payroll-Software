/**
 * POST /api/payroll/runs/[id]/retry (PAY-192)
 *
 * Re-queues the compute of a run stuck in PROCESSING with no live job.
 * Refused (409) while its job is still waiting or running, and for any run
 * that is not PROCESSING.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, ok, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { enqueuePayrollRun, hasLivePayrollJob } from "@/lib/jobs/workers";
import { retryStuckRun, stuckRunMessage } from "@/lib/jobs/stuck-runs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "PAYROLL", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;
  try {
    const r = await withTenant(auth.tenantId, (tx) =>
      retryStuckRun(tx, auth.tenantId, id, { hasLiveJob: hasLivePayrollJob, enqueue: enqueuePayrollRun }),
    );
    if (!r.ok) {
      const m = stuckRunMessage(r);
      return err(m.message, m.status);
    }
    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "UPDATE",
      entity: "PayrollBook",
      entityId: id,
      changes: { action: "retry_stuck_run" },
    });
    return ok({ id }, "The run is being computed again. Refresh in a minute.");
  } catch (e) {
    return serverError(e);
  }
}
