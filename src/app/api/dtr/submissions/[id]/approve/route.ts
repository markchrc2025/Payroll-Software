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
 * PAY-181: payroll reads DTR days, not submissions. Final approval therefore
 * approves every PENDING, unlocked day of the employee inside the submission
 * period, and no step can be approved while a day in the period still has a
 * missing punch (the PAY-177 rule for single days).
 *
 * Body (optional): { note?: string }
 */
import { requireApprover } from "@/lib/approvals/second-party";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { err, forbidden, notFound, ok } from "@/lib/api-response";

const bodySchema = z.object({ note: z.string().optional() }).optional();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Unit 0.22 Am 1 (B5): the owner or a role granted TIMESHEETS:APPROVE.
  const guard = await requireApprover(req, "DTR");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  // The Approve button posts with no body; read that as "no note" (PAY-181).
  const { note } = bodySchema.parse(rawBody ?? undefined) ?? {};

  const result = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true, currentStepIndex: true, employeeId: true, periodStart: true, periodEnd: true },
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

    const periodDays = {
      tenantId: auth.tenantId,
      employeeId: submission.employeeId,
      date: { gte: submission.periodStart, lte: submission.periodEnd },
    };
    const missing = await tx.dTRRecord.findMany({
      where: { ...periodDays, hasMissingPunch: true },
      select: { date: true },
      orderBy: { date: "asc" },
    });
    if (missing.length > 0)
      return { missing: missing.map((m) => m.date.toISOString().slice(0, 10)) };

    // Final approval: the period's days become APPROVED so payroll uses them.
    const approveDays = () =>
      tx.dTRRecord.updateMany({
        where: { ...periodDays, approvalStatus: "PENDING", isLocked: false },
        data: { approvalStatus: "APPROVED", approvedById: auth.userId ?? null, approvedAt: new Date() },
      });

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

      await approveDays();
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
    await approveDays();
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
  if (typeof result === "object" && result && "missing" in result)
    return err(
      `These days have a missing punch: ${result.missing.join(", ")}. Enter the missing times first, then approve.`,
      409,
      { missingPunchDates: result.missing },
    );
  if (result === "no_pending")
    return err("No pending approval step for this submission", 409);
  return ok(result, "DTR submission approved");
}
