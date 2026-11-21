/** GET /api/ess/team/documents: the documents shared with the employee, and what to acknowledge. Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { employeeDocuments } from "@/lib/team/sharing";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  return ok(await withTenant(ctx.tenantId, (tx) => employeeDocuments(tx, ctx.tenantId, ctx.employeeId)));
}
