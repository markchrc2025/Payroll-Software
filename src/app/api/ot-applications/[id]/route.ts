/**
 * GET /api/ot-applications/[id] — Get single OT application
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.oTApplication.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    })
  );

  if (!row) return notFound("OT application not found");
  return ok(row);
}
