/**
 * Wave E1 (PAY-215): Leave Earning Policies (src/lib/leave/earning-policy.ts).
 *   GET   the company's policies (LEAVES:READ)
 *   POST  a policy (LEAVES:UPDATE); nothing is written to employees until it is applied
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { parsePolicy, PolicyRefusal } from "@/lib/leave/earning-policy";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  const rows = await withTenant(auth.tenantId, (tx) => tx.leaveEarningPolicy.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    include: { leaveType: { select: { name: true, code: true } }, _count: { select: { entitlements: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
  }));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  try {
    const data = parsePolicy(await req.json().catch(() => null));
    const row = await withTenant(auth.tenantId, async (tx) => {
      const lt = await tx.leaveType.findFirst({ where: { id: data.leaveTypeId, tenantId: auth.tenantId, deletedAt: null } });
      if (!lt) throw new PolicyRefusal("That leave type is not the company's");
      return tx.leaveEarningPolicy.create({ data: { ...data, tenantId: auth.tenantId } });
    });
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "CREATE", entity: "LeaveEarningPolicy", entityId: row.id, ipAddress: getClientIp(req) });
    return ok(row, "Policy saved", 201);
  } catch (e) {
    if (e instanceof PolicyRefusal) return err(e.message, 422);
    throw e;
  }
}
