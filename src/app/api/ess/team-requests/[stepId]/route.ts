/**
 * POST /api/ess/team-requests/[stepId]  (PAY-191 part 2)
 *
 * The assigned approver of a request's due step approves or rejects it in ESS.
 * Body: { decision: "APPROVE" | "REJECT", note?: string } (a reason is required
 * to reject). The final approval has the same effect as HR's approve route.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { actOnTeamStep } from "@/lib/approvals/team-requests";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { enqueueOtApproved } from "@/lib/jobs/workers";

const bodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).optional().nullable(),
});

const ENTITY = { LEAVE: "LeaveTransaction", OT: "OTApplication", UNDERTIME: "UndertimeRequest" } as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ stepId: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { stepId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Send decision APPROVE or REJECT", 422, parsed.error.flatten());

  try {
    const { result, actorUserId } = await withTenant(ctx.tenantId, async (tx) => {
      const me = await tx.employee.findFirst({ where: { id: ctx.employeeId, tenantId: ctx.tenantId }, select: { userId: true } });
      const actorUserId = me?.userId ?? null;
      const result = await actOnTeamStep(tx, {
        tenantId: ctx.tenantId, stepId, approverEmployeeId: ctx.employeeId, actorUserId,
        decision: parsed.data.decision, note: parsed.data.note,
      });
      return { result, actorUserId };
    });

    if (!result.ok) {
      switch (result.code) {
        case "NOT_FOUND": return notFound("Request");
        case "NOT_YOURS": return forbidden("This request is not waiting for you.");
        case "SELF": return forbidden("You cannot approve your own request.");
        case "NOT_DUE": return err("An earlier approver has not acted on this request yet.", 409);
        case "NOT_PENDING": return err("This request has already been decided.", 409);
        case "REASON_REQUIRED": return err("Give a reason for rejecting.", 422);
      }
    }

    void writeAuditLog({
      tenantId: ctx.tenantId,
      actorUserId,
      action: parsed.data.decision === "APPROVE" ? "APPROVE" : "REJECT",
      entity: ENTITY[result.module],
      entityId: result.entityId,
      changes: { via: "ESS team requests", approverEmployeeId: ctx.employeeId, stepId, status: result.status },
      ipAddress: getClientIp(req),
    });
    if (result.module === "OT" && result.status === "APPROVED") {
      void enqueueOtApproved({ tenantId: ctx.tenantId, otApplicationId: result.entityId }).catch((e) =>
        console.error("[ess/team-requests] Failed to enqueue ot.approved:", e),
      );
    }
    const message =
      result.status === "REJECTED" ? "Request rejected"
        : result.final ? "Request approved"
          : "Approved; it now goes to the next approver";
    return ok(result, message);
  } catch (e) {
    return serverError(e);
  }
}
