/**
 * GET /api/ess/document-templates: the documents an employee may request in
 * ESS (Wave C3, PAY-213). Names only; the text is filled when HR approves.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const rows = await withTenant(ctx.tenantId, (tx) => tx.documentTemplate.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null, isActive: true, availableInEss: true },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  }));
  return ok(rows);
}
