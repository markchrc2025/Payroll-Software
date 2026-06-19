/**
 * POST /api/undertime-requests/[id]/reject
 *
 * PENDING | APPROVED → REJECTED. rejectionReason is required.
 * Works in both workflow-step mode and legacy/no-workflow mode.
 *
 * Rejecting an approved request removes the excuse: the day's undertime
 * becomes deductible again (the aggregator only excuses APPROVED requests).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission, checkPermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required").max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const utr = await tx.undertimeRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!utr) return { notFound: true as const };
    if (utr.status !== "PENDING" && utr.status !== "APPROVED")
      return { notRejectable: true as const, status: utr.status };

    const steps = await tx.approvalStep.findMany({
      where: { tenantId: auth.tenantId, module: "UNDERTIME", entityId: id },
      orderBy: { stepIndex: "asc" },
    });

    if (steps.length > 0) {
      const currentStep =
        steps.find((s) => s.stepIndex === utr.currentStepIndex && s.status === "PENDING") ??
        steps.find((s) => s.status === "PENDING");

      if (currentStep) {
        const callerEmployee = await tx.employee.findFirst({
          where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
          select: { id: true },
        });
        const isAssignedApprover = callerEmployee?.id === currentStep.approverEmployeeId;
        const isOverride =
          auth.systemRole === "SUPER_ADMIN" ||
          (auth.roleId
            ? await checkPermission(auth.tenantId, auth.roleId, "TIMESHEETS", "APPROVE")
            : false);

        if (!isAssignedApprover && !isOverride) return { forbidden: true as const };

        await tx.approvalStep.update({
          where: { id: currentStep.id },
          data: { status: "REJECTED", actedByUserId: auth.userId, actedAt: new Date() },
        });
      }
    }

    const updated = await tx.undertimeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: auth.userId,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
      },
    });

    return { notFound: false as const, notRejectable: false as const, row: updated };
  });

  if ("notFound" in result && result.notFound) return notFound("Undertime request not found");
  if ("notRejectable" in result && result.notRejectable)
    return err(`Cannot reject a ${result.status} request`, 409);
  if ("forbidden" in result && result.forbidden)
    return err("You are not the assigned approver for this step", 403);
  return ok(result.row, "Undertime request rejected");
}
