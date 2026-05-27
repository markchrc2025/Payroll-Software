/**
 * GET /api/movements/[id] — Detail view for one movement.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized, notFound } from "@/lib/api-response";
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
  return ok(serializeMovement(movement));
}
