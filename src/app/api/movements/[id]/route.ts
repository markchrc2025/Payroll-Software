/**
 * GET /api/movements/[id] — Detail view for one movement.
 *
 * Unit 0.25: visible to roles with MOVEMENTS:READ, and to the person who
 * created the request (a manager following up on their own request).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized, notFound } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { serializeMovement } from "@/lib/movements/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const movement = await withTenant(auth.tenantId, (tx) =>
    tx.employeeMovement.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            branchId: true,
            positionId: true,
          },
        },
      },
    }),
  );

  if (!movement) return notFound("Movement");
  if (movement.createdByUserId !== auth.userId) {
    const denied = await forbidUnless(auth, ["MOVEMENTS", "READ"]);
    if (denied) return denied;
  }
  return ok(serializeMovement(movement));
}
