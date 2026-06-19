/**
 * POST /api/undertime-requests/[id]/approve
 *
 * Two modes:
 *   1. Workflow step: caller must be the approver for the current pending step,
 *      OR have TIMESHEETS:APPROVE override. Advances through steps; on the final
 *      step the request is APPROVED (aggregator then excuses the undertime).
 *   2. Legacy / no-workflow: TIMESHEETS:APPROVE can approve directly.
 *
 * Idempotent: re-approving an APPROVED request returns 200.
 *
 * Note: approval EXCUSES the undertime — it does NOT write minutes onto the DTR.
 * The aggregator subtracts approved undertime minutes from the deductible total,
 * so an approved early-departure is not deducted from pay. Only unfiled /
 * unapproved undertime is deducted.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission, checkPermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";

const bodySchema = z.object({ note: z.string().optional() }).optional();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  const { note } = bodySchema.parse(rawBody) ?? {};

  const result = await withTenant(auth.tenantId, async (tx) => {
    const utr = await tx.undertimeRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!utr) return { notFound: true as const };
    if (utr.status === "APPROVED") return { row: utr };
    if (utr.status === "REJECTED" || utr.status === "CANCELLED")
      return { terminal: true as const, status: utr.status };

    const steps = await tx.approvalStep.findMany({
      where: { tenantId: auth.tenantId, module: "UNDERTIME", entityId: id },
      orderBy: { stepIndex: "asc" },
    });

    // ----- Workflow step mode -----
    if (steps.length > 0) {
      const currentStep =
        steps.find((s) => s.stepIndex === utr.currentStepIndex && s.status === "PENDING") ??
        steps.find((s) => s.status === "PENDING");

      if (!currentStep) return { terminal: true as const, status: utr.status };

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
        data: { status: "APPROVED", actedByUserId: auth.userId, actedAt: new Date(), note: note ?? null },
      });

      const nextStep = steps.find(
        (s) => s.stepIndex > currentStep.stepIndex && s.status === "PENDING",
      );

      if (nextStep) {
        await tx.undertimeRequest.update({
          where: { id },
          data: { currentStepIndex: nextStep.stepIndex },
        });
        return { row: utr };
      }

      // Final step — approve the request.
      const updated = await tx.undertimeRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: auth.userId,
          approvedAt: new Date(),
          currentStepIndex: currentStep.stepIndex,
        },
      });
      return { row: updated };
    }

    // ----- Legacy / no-workflow mode -----
    const now = new Date();
    const updated = await tx.undertimeRequest.update({
      where: { id },
      data: { status: "APPROVED", approverId: auth.userId, approvedAt: utr.approvedAt ?? now },
    });
    return { row: updated };
  });

  if ("notFound" in result && result.notFound) return notFound("Undertime request not found");
  if ("terminal" in result && result.terminal)
    return err(`Cannot approve a ${result.status} request`, 409);
  if ("forbidden" in result && result.forbidden)
    return err("You are not the assigned approver for this step", 403);

  return ok(result.row, "Undertime request approved");
}
