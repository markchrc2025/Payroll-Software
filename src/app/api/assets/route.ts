/**
 * GET  /api/assets — List all assets (filterable by status, category, employeeId).
 * POST /api/assets — Create a new asset.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, paginated, err } from "@/lib/api-response";
import { createAssetSchema, listAssetsSchema } from "@/lib/validations/asset";
import { toCentavos, centavosToJson } from "@/lib/money";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listAssetsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { status, category, employeeId, page, limit } = parsed.data;

  const where: Prisma.AssetWhereInput = {
    tenantId: ctx.tenantId,
    deletedAt: null,
    ...(status && { status }),
    ...(category && { category: { contains: category, mode: "insensitive" } }),
    ...(employeeId && {
      assignments: {
        some: { employeeId, returnedAt: null },
      },
    }),
  };

  const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.asset.findMany({
        where,
        orderBy: [{ assetCode: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignments: {
            where: { returnedAt: null },
            take: 1,
            include: {
              employee: {
                select: { id: true, employeeNumber: true, firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      tx.asset.count({ where }),
    ]),
  );

  const data = rows.map((a) => ({
    ...a,
    purchaseCostCents: centavosToJson(a.purchaseCostCents),
    currentAssignment: a.assignments[0] ?? null,
    assignments: undefined,
  }));

  return paginated(data, total, page, limit);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { purchaseCost, ...rest } = parsed.data;

  const purchaseCostCents = purchaseCost ? toCentavos(purchaseCost) : null;

  const asset = await withTenant(ctx.tenantId, (tx) =>
    tx.asset.create({
      data: {
        ...rest,
        purchaseCostCents,
        tenantId: ctx.tenantId,
        createdByUserId: ctx.userId,
      },
    }),
  );

  return ok(
    { ...asset, purchaseCostCents: centavosToJson(asset.purchaseCostCents) },
    "Asset created",
    201,
  );
}
