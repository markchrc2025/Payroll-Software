/**
 * POST /api/leave-earning-policies/[id]/apply: writes the employees'
 * entitlements as the preview shows (LEAVES:UPDATE). Applying twice changes
 * nothing. Wave E1 (PAY-215).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { applyPolicy } from "@/lib/leave/earning-policy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const result = await withTenant(auth.tenantId, async (tx) => {
    const p = await tx.leaveEarningPolicy.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    if (!p) return null;
    if (!p.isActive) return "inactive" as const;
    const r = await applyPolicy(tx, p);
    await tx.leaveEarningPolicy.update({ where: { id }, data: { lastAppliedAt: new Date() } });
    return r;
  });
  if (!result) return notFound("Policy");
  if (result === "inactive") return err("Turn the policy on before applying it", 409);
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "LeaveEarningPolicy", entityId: id, changes: { action: "apply", ...result }, ipAddress: getClientIp(req) });
  return ok(result, `Applied: ${result.employees} employee(s), ${result.created} entitlement(s) written`);
}
