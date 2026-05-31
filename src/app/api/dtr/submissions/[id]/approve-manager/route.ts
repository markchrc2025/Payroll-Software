/**
 * /api/dtr/submissions/[id]/approve-manager
 *   POST — SUPERVISOR_APPROVED → MANAGER_APPROVED
 *        (or SUBMITTED → MANAGER_APPROVED when requiresSupervisorVerification = false)
 *
 * This is the final gate before the Payroll Engine may consume the submission.
 * Requires TIMESHEETS:APPROVE permission.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!submission) return null;

    // Check tenant approval config for supervisor bypass
    const config = await tx.dTRApprovalConfig.findUnique({
      where: { tenantId: auth.tenantId },
      select: { requiresSupervisorVerification: true },
    });
    const requiresSupervisor = config?.requiresSupervisorVerification ?? true;

    const allowedStatuses = requiresSupervisor
      ? ["SUPERVISOR_APPROVED"]
      : ["SUBMITTED", "SUPERVISOR_APPROVED"];

    if (!allowedStatuses.includes(submission.status)) {
      return requiresSupervisor ? "NEEDS_SUPERVISOR" : "WRONG_STATUS";
    }

    const actorEmployee = auth.userId
      ? await tx.employee.findFirst({
          where: { userId: auth.userId, tenantId: auth.tenantId },
          select: { id: true },
        })
      : null;

    return tx.dTRSubmission.update({
      where: { id },
      data: {
        status: "MANAGER_APPROVED",
        managerId: actorEmployee?.id ?? null,
        managerActedAt: new Date(),
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "NEEDS_SUPERVISOR")
    return err("Submission must be supervisor-approved first", 409);
  if (updated === "WRONG_STATUS")
    return err("Submission is not in an approvable status", 409);
  return ok(updated, "Submission approved by manager");
}
