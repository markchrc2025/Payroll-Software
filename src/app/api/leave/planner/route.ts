/**
 * GET /api/leave/planner?from&to&departmentId: approved and pending leave per
 * day by department, with coverage warnings (LEAVES:READ). Wave E3 (PAY-215).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { planner } from "@/lib/leave/schedule";

const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const from = day(sp.get("from")), to = day(sp.get("to"));
  if (!from || !to || to < from) return err("Give from and to dates", 422);
  if (to.getTime() - from.getTime() > 61 * 86_400_000) return err("The planner shows at most 62 days", 422);
  return ok(await withTenant(auth.tenantId, (tx) => planner(tx, auth.tenantId, from, to, sp.get("departmentId") || null)));
}
