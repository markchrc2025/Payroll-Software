/**
 * GET /api/movements/can-initiate
 * Returns { canInitiate: boolean, isHR: boolean } for the calling user.
 * Used by the UI to conditionally render the "New Movement" button.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (auth.systemRole === "SUPER_ADMIN") return ok({ canInitiate: true, isHR: false });

  const result = await withTenant(auth.tenantId, async (tx) => {
    const me = await tx.employee.findFirst({
      where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    // Pure admin (no linked Employee record): allowed
    if (!me) return { canInitiate: true, isHR: false };

    const [managedCount, hrRole] = await Promise.all([
      tx.employee.count({
        where: { managerId: me.id, tenantId: auth.tenantId, deletedAt: null },
      }),
      tx.orgRole.findFirst({
        where: { employeeId: me.id, tenantId: auth.tenantId, roleKey: "hr_manager" },
        select: { roleKey: true },
      }),
    ]);

    const isHR = hrRole !== null;
    const isManager = managedCount > 0;
    return { canInitiate: isHR || isManager, isHR };
  });

  return ok(result);
}
