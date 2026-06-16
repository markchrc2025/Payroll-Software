/**
 * GET /api/users — list active users in the current tenant.
 * Used by the employee profile page for the "Link User Account" picker.
 * Requires EMPLOYEES:READ.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const users = await withTenant(ctx.tenantId, (tx) =>
    tx.user.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null, isActive: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        assignedRole: { select: { name: true } },
      },
    }),
  );

  return ok(users);
}
