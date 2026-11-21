/** PAY-217 G1: GET ?asOf=YYYY-MM-DD lists everyone below the regional minimum wage in force that day. */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { wageOrderProposal } from "@/lib/salary-adjustment/batch";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;
  const asOf = new URL(req.url).searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return err("Use YYYY-MM-DD", 422);
  return ok(await withTenant(auth.tenantId, (tx) => wageOrderProposal(tx, auth.tenantId, new Date(`${asOf}T00:00:00.000Z`))));
}
