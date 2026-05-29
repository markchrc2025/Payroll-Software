/**
 * GET /api/employees/[id]/assets — List all asset assignments for an employee
 * (active and historical).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";
import { centavosToJson } from "@/lib/money";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!employee) return notFound("Employee");

  const assignments = await withTenant(ctx.tenantId, (tx) =>
    tx.assetAssignment.findMany({
      where: { employeeId: id, tenantId: ctx.tenantId },
      orderBy: [{ assignedAt: "desc" }],
      include: {
        asset: {
          select: {
            id: true,
            assetCode: true,
            name: true,
            category: true,
            brand: true,
            model: true,
            serialNumber: true,
            purchaseCostCents: true,
          },
        },
      },
    }),
  );

  const data = assignments.map((a) => ({
    ...a,
    asset: {
      ...a.asset,
      purchaseCostCents: centavosToJson(a.asset.purchaseCostCents),
    },
  }));

  return ok(data);
}
