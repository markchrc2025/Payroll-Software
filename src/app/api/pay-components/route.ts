/**
 * /api/pay-components
 *   GET  — list tenant catalog (filter: kind, isActive, includeDeleted)
 *   POST — create a pay component
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  createPayComponentSchema,
  listPayComponentsSchema,
} from "@/lib/validations/pay-component";
import { serializePayComponent } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listPayComponentsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { kind, isActive, includeDeleted, page, limit } = parsed.data;

  const where: Prisma.PayComponentWhereInput = {
    tenantId: auth.tenantId,
    ...(kind && { kind }),
    ...(isActive !== undefined && { isActive }),
    ...(includeDeleted ? {} : { deletedAt: null }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.payComponent.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.payComponent.count({ where }),
    ]),
  );

  return paginated(rows.map(serializePayComponent), total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createPayComponentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  // Catch unique-code conflict cleanly
  const existing = await withTenant(auth.tenantId, (tx) =>
    tx.payComponent.findUnique({
      where: { tenantId_code: { tenantId: auth.tenantId, code: d.code } },
    }),
  );
  if (existing) return err(`PayComponent code "${d.code}" already exists`, 409);

  const created = await withTenant(auth.tenantId, (tx) =>
    tx.payComponent.create({
      data: {
        tenantId: auth.tenantId,
        code: d.code,
        name: d.name,
        kind: d.kind,
        taxability: d.taxability,
        deMinimisCode: d.deMinimisCode ?? null,
        includeIn13thMonth: d.includeIn13thMonth,
        includeInSssBase: d.includeInSssBase,
        includeInPhilHealthBase: d.includeInPhilHealthBase,
        includeInPagibigBase: d.includeInPagibigBase,
        isActive: d.isActive,
      },
    }),
  );

  return ok(serializePayComponent(created), "PayComponent created", 201);
}
