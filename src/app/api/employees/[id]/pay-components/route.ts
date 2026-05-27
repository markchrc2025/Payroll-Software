/**
 * /api/employees/[id]/pay-components
 *   GET  — list pay-component assignments for one employee
 *          (?asOf=YYYY-MM-DD filters to assignments active on that date)
 *   POST — assign a pay component (amount in pesos, effective dates)
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { toCentavos } from "@/lib/money";
import {
  assignPayComponentSchema,
  listAssignmentsSchema,
} from "@/lib/validations/pay-component";
import { serializeEmployeePayComponent } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listAssignmentsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { asOf } = parsed.data;

  const where: Prisma.EmployeePayComponentWhereInput = {
    tenantId: auth.tenantId,
    employeeId,
    ...(asOf && {
      effectiveFrom: { lte: asOf },
      OR: [{ endDate: null }, { endDate: { gte: asOf } }],
    }),
  };

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.employeePayComponent.findMany({
      where,
      orderBy: [{ effectiveFrom: "desc" }],
      include: { payComponent: true },
    }),
  );

  return ok(
    rows.map((r) => ({
      ...serializeEmployeePayComponent(r),
      payComponent: r.payComponent,
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = assignPayComponentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const [employee, component] = await Promise.all([
      tx.employee.findFirst({
        where: { id: employeeId, tenantId: auth.tenantId },
        select: { id: true },
      }),
      tx.payComponent.findFirst({
        where: {
          id: d.payComponentId,
          tenantId: auth.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!employee) return { error: "employee" as const };
    if (!component) return { error: "component" as const };

    const created = await tx.employeePayComponent.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        payComponentId: d.payComponentId,
        amountCents: toCentavos(d.amount),
        effectiveFrom: d.effectiveFrom,
        endDate: d.endDate ?? null,
        notes: d.notes ?? null,
      },
    });
    return { ok: created };
  });

  if ("error" in result) {
    return result.error === "employee"
      ? notFound("Employee")
      : notFound("PayComponent");
  }
  return ok(
    serializeEmployeePayComponent(result.ok),
    "Pay component assigned",
    201,
  );
}
