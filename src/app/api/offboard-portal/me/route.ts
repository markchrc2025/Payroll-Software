/** PAY-197 part 2: the signed-in leaving employee's own case, forms and documents. */
import type { NextRequest } from "next/server";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getPortalSession, portalSummary } from "@/lib/offboarding/portal";

export async function GET(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  return ok(await withTenant(ctx.tenantId, (tx) => portalSummary(tx, ctx)));
}
