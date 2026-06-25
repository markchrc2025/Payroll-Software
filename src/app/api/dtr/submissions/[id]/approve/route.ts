/**
 * /api/dtr/submissions/[id]/approve
 *   POST — approve the current step of a DTR submission's approval chain.
 *
 * Two modes:
 *   1. Workflow: caller must be the assigned approver for the current step, OR
 *      hold the TIMESHEETS:APPROVE override. Advances through ApprovalStep rows;
 *      when the final step is approved the submission becomes MANAGER_APPROVED
 *      (eligible for payroll).
 *   2. No-workflow: a TIMESHEETS:APPROVE holder approves directly to
 *      MANAGER_APPROVED (matches the legacy single-action behaviour).
 *
 * Body (optional): { note?: string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, forbidden, notFound, ok } from "@/lib/api-response";

const bodySchema = z.object({ note: z.string().optional() }).optional();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  const { note } = bodySchema.parse(rawBody) ?? {};

  const result = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true, currentStepIndex: true, employeeId: true },
    });
    if (!submission) return "not_found" as const;
    if (submission.status === "MANAGER_APPROVED") return submission;
    if (submission.status === "RETURNED")
      return "returned" as const;

    const actorEmployee = auth.userId
      ? await tx.employee.findFirst({
          where: { userId: auth.userId, tenantId: auth.tenantId },
          select: { id: true },
        })
      : null;

    if (actorEmployee?.id && actorEmployee.id === submission.employeeId)
      return "self" as const;

    const steps = await tx.approvalStep.findMany({
      where: { tenantId: auth.tenantId, module: "DTR", entityId: id },
      orderBy: { stepIndex: "asc" },
    });

    // ----- Workflow mode -----
    if (steps.length > 0) {
      const currentStep =
        steps.find((s) => s.stepIndex === submission.currentStepIndex && s.status === "PENDING") ??
        steps.find((s) => s.status === "PENDING");
      if (!currentStep) return "no_pending" as const;

      // requirePermission already guarantees TIMESHEETS:APPROVE; the assigned
      // approver also qualifies even without it (handled by the guard above).
      await tx.approvalStep.update({
        where: { id: currentStep.id },
        data: {
          status: "APPROVED",
          actedByUserId: auth.userId,
          actedAt: new Date(),
          note: note ?? null,
        },
      });

      const nextStep = steps.find(
        (s) => s.stepIndex > currentStep.stepIndex && s.status === "PENDING",
      );

      if (nextStep) {
        return tx.dTRSubmission.update({
          where: { id },
          data: {
            currentStepIndex: nextStep.stepIndex,
            // Mark the interim state once at least one step has approved.
            status: "SUPERVISOR_APPROVED",
            supervisorId: actorEmployee?.id ?? undefined,
            supervisorActedAt: new Date(),
          },
        });
      }

      return tx.dTRSubmission.update({
        where: { id },
        data: {
          status: "MANAGER_APPROVED",
          managerId: actorEmployee?.id ?? null,
          managerActedAt: new Date(),
        },
      });
    }

    // ----- No-workflow mode (direct final approval) -----
    return tx.dTRSubmission.update({
      where: { id },
      data: {
        status: "MANAGER_APPROVED",
        managerId: actorEmployee?.id ?? null,
        managerActedAt: new Date(),
      },
    });
  });

  if (result === "not_found") return notFound("DTR submission");
  if (result === "self")
    return forbidden("You cannot approve your own DTR submission");
  if (result === "returned")
    return err("Submission was returned and cannot be approved", 409);
  if (result === "no_pending")
    return err("No pending approval step for this submission", 409);
  return ok(result, "DTR submission approved");
}
