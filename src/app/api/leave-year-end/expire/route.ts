/**
 * POST /api/leave-year-end/expire  { asOf: "YYYY-MM-DD" }
 * Wave E2 (PAY-215): carried days whose time is up expire (LEAVES:UPDATE).
 * Days used in the new year come out of the carried days first.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { expireCarried } from "@/lib/leave/year-end";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const parsed = z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Give the date as YYYY-MM-DD", 422);
  const r = await withTenant(auth.tenantId, (tx) => expireCarried(tx, auth.tenantId, new Date(`${parsed.data.asOf}T00:00:00.000Z`)));
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "LeaveYearEnd", entityId: parsed.data.asOf, changes: { action: "expire", ...r }, ipAddress: getClientIp(req) });
  return ok(r, `${r.expired} carry-over(s) expired`);
}
