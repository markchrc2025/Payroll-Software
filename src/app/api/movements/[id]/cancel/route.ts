/**
 * POST /api/movements/[id]/cancel  — Creator cancels a PENDING movement.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
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
    if (m.createdByUserId !== auth.userId) {
      return { error: "Only the creator can cancel this movement" as const, status: 403 };
    }
    if (m.approvalStatus !== "PENDING") {
      return {
        error: `Cannot cancel movement in status ${m.approvalStatus}` as const,
        status: 409,
      };
    }

    const updated = await tx.employeeMovement.update({
      where: { id },
      data: { approvalStatus: "CANCELLED" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "UPDATE",
        entity: "EmployeeMovement",
        entityId: id,
        changes: { from: "PENDING", to: "CANCELLED" },
      },
    });
    return { movement: updated };
  });

  if ("notFound" in result) return notFound("Movement");
  if ("error" in result && result.error) return err(result.error, result.status);
  return ok(serializeMovement(result.movement), "Movement cancelled");
}
