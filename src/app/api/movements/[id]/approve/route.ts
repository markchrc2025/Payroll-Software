/**
 * POST /api/movements/[id]/approve
 *
 * Two-stage approval:
 *   PENDING    → FOR_REVIEW  (first approver; cannot be the creator)
 *   FOR_REVIEW → APPROVED    (finalizer; must differ from creator AND first approver,
 *                              applies changes to Employee record)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { applyMovementEffects } from "@/lib/movements/apply";
import { serializeMovement } from "@/lib/movements/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const m = await tx.employeeMovement.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!m) return { notFound: true as const };

    if (m.createdByUserId && m.createdByUserId === auth.userId) {
      return { error: "You cannot approve a movement you created" as const, status: 403 };
    }

    if (m.approvalStatus === "PENDING") {
      // First-stage approval. Record approver via AuditLog; keep status moving.
      const updated = await tx.employeeMovement.update({
        where: { id },
        data: { approvalStatus: "FOR_REVIEW" },
      });
      await tx.auditLog.create({
        data: {
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "APPROVE",
          entity: "EmployeeMovement",
          entityId: id,
          changes: { stage: "first", from: "PENDING", to: "FOR_REVIEW" },
        },
      });
      return { movement: updated };
    }

    if (m.approvalStatus === "FOR_REVIEW") {
      // Block self-finalize: finalizer must differ from first approver.
      const firstApproval = await tx.auditLog.findFirst({
        where: {
          tenantId: auth.tenantId,
          entity: "EmployeeMovement",
          entityId: id,
          action: "APPROVE",
        },
        orderBy: { createdAt: "asc" },
        select: { actorUserId: true },
      });
      if (firstApproval?.actorUserId && firstApproval.actorUserId === auth.userId) {
        return {
          error: "Finalizer must differ from the first-stage approver" as const,
          status: 403,
        };
      }

      const updated = await tx.employeeMovement.update({
        where: { id },
        data: {
          approvalStatus: "APPROVED",
          approvedByUserId: auth.userId,
          approvedAt: new Date(),
        },
      });
      await applyMovementEffects(tx, updated);

      await tx.auditLog.create({
        data: {
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "APPROVE",
          entity: "EmployeeMovement",
          entityId: id,
          changes: { stage: "final", from: "FOR_REVIEW", to: "APPROVED", applied: true },
        },
      });
      return { movement: updated };
    }

    return {
      error: `Cannot approve movement in status ${m.approvalStatus}` as const,
      status: 409,
    };
  });

  if ("notFound" in result) return notFound("Movement");
  if ("error" in result && result.error) return err(result.error, result.status);
  return ok(serializeMovement(result.movement), "Movement approved");
}
