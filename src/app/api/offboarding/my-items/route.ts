/**
 * PAY-197: GET the clearance items waiting for the signed-in user's sign-off.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: lists only the items assigned to the signed-in user.
  const rows = await withTenant(auth.tenantId, (tx) => tx.clearanceItem.findMany({
    where: { tenantId: auth.tenantId, signatoryUserId: auth.userId, status: "PENDING", case: { status: "OPEN" } },
    include: { case: { select: { id: true, lastWorkingDay: true, employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } },
    orderBy: { createdAt: "asc" },
  }));
  return ok(rows);
}
