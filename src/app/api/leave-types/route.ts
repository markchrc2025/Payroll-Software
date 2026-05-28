/**
 * /api/leave-types
 *   GET  — list leave type catalog for tenant
 *   POST — create a leave type
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, paginated, unauthorized } from "@/lib/api-response";
import { createLeaveTypeSchema, listLeaveTypesSchema } from "@/lib/validations/leave";
import { serializeLeaveType } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listLeaveTypesSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { isActive, includeDeleted, page, limit } = parsed.data;

  const where: Prisma.LeaveTypeWhereInput = {
    tenantId: auth.tenantId,
    ...(isActive !== undefined && { isActive }),
    ...(includeDeleted ? {} : { deletedAt: null }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.leaveType.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.leaveType.count({ where }),
    ]),
  );

  return paginated(rows.map(serializeLeaveType), total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createLeaveTypeSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const existing = await withTenant(auth.tenantId, (tx) =>
    tx.leaveType.findUnique({
      where: { tenantId_code: { tenantId: auth.tenantId, code: d.code } },
    }),
  );
  if (existing) return err("A leave type with this code already exists", 409);

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.leaveType.create({
      data: { ...d, tenantId: auth.tenantId },
    }),
  );

  return ok(serializeLeaveType(row), "LeaveType created", 201);
}
