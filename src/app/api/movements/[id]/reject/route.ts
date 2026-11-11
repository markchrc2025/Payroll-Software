/**
 * POST /api/movements/[id]/reject  — Reject a PENDING or FOR_REVIEW movement.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { rejectMovementSchema } from "@/lib/validations/movement";
import { serializeMovement } from "@/lib/movements/serialize";
import { forbidUnless } from "@/lib/authz/route-permission";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["EMPLOYEES", "APPROVE"]);
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = rejectMovementSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const m = await tx.employeeMovement.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!m) return { notFound: true as const };
    if (m.approvalStatus !== "PENDING" && m.approvalStatus !== "FOR_REVIEW") {
      return { error: `Cannot reject movement in status ${m.approvalStatus}` as const };
    }

    const updated = await tx.employeeMovement.update({
      where: { id },
      data: {
        approvalStatus: "REJECTED",
        approvedByUserId: auth.userId,
        approvedAt: new Date(),
        rejectionReason: parsed.data.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "REJECT",
        entity: "EmployeeMovement",
        entityId: id,
        changes: { from: m.approvalStatus, to: "REJECTED", reason: parsed.data.reason },
      },
    });
    return { movement: updated };
  });

  if ("notFound" in result) return notFound("Movement");
  if ("error" in result && result.error) return err(result.error, 409);
  return ok(serializeMovement(result.movement), "Movement rejected");
}
