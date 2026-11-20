/**
 * GET /api/ess/team-requests  (PAY-191 part 2)
 *
 * The requests waiting for the signed-in employee as an approver: leave,
 * overtime and undertime whose due approval step is assigned to them by the
 * company's approval workflow. See src/lib/approvals/team-requests.ts.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { listTeamRequests } from "@/lib/approvals/team-requests";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  try {
    const items = await withTenant(ctx.tenantId, (tx) => listTeamRequests(tx, ctx.tenantId, ctx.employeeId));
    return ok(items);
  } catch (e) {
    return serverError(e);
  }
}
