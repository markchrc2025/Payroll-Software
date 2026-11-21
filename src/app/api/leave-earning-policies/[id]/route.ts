/**
 * Wave E1 (PAY-215): one Leave Earning Policy.
 *   PATCH   replace its rule (LEAVES:UPDATE); employees change only when it is applied again
 *   DELETE  remove it (LEAVES:UPDATE); entitlements already written stay
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { parsePolicy, PolicyRefusal } from "@/lib/leave/earning-policy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const data = parsePolicy(await req.json().catch(() => null));
    const row = await withTenant(auth.tenantId, async (tx) => {
      const cur = await tx.leaveEarningPolicy.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
      if (!cur) return null;
      const lt = await tx.leaveType.findFirst({ where: { id: data.leaveTypeId, tenantId: auth.tenantId, deletedAt: null } });
      if (!lt) throw new PolicyRefusal("That leave type is not the company's");
      if (cur.leaveTypeId !== data.leaveTypeId && (await tx.leaveEntitlement.count({ where: { policyId: id, deletedAt: null } }))) {
        throw new PolicyRefusal("This policy already wrote entitlements: make a new policy for another leave type");
      }
      return tx.leaveEarningPolicy.update({ where: { id }, data });
    });
    if (!row) return notFound("Policy");
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "LeaveEarningPolicy", entityId: id, ipAddress: getClientIp(req) });
    return ok(row, "Policy saved");
  } catch (e) {
    if (e instanceof PolicyRefusal) return err(e.message, 422);
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const row = await withTenant(auth.tenantId, async (tx) => {
    const cur = await tx.leaveEarningPolicy.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    return cur ? tx.leaveEarningPolicy.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }) : null;
  });
  if (!row) return notFound("Policy");
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "LeaveEarningPolicy", entityId: id, ipAddress: getClientIp(req) });
  return ok({ id }, "Policy removed");
}
