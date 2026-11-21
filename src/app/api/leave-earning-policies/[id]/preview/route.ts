/**
 * GET /api/leave-earning-policies/[id]/preview: the entitlements applying
 * the policy would write, employee by employee (LEAVES:READ). Wave E1 (PAY-215).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { planPolicy } from "@/lib/leave/earning-policy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  const plan = await withTenant(auth.tenantId, async (tx) => {
    const p = await tx.leaveEarningPolicy.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    return p ? planPolicy(tx, p) : null;
  });
  if (!plan) return notFound("Policy");
  return ok(plan);
}
