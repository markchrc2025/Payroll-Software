/**
 * GET /api/ess/assets — List own asset assignments (active + historical)
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { centavosToJson } from "@/lib/money";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  try {
    const assignments = await withTenant(ctx.tenantId, (tx) =>
      tx.assetAssignment.findMany({
        where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId },
        orderBy: [{ returnedAt: "asc" }, { assignedAt: "desc" }],
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
  } catch (e) {
    console.error("[ess/assets GET]", e);
    return serverError(e);
  }
}
