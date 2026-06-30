/**
 * /api/employees/[id]/education
 *   GET  — list an employee's education records
 *   POST — add an education record
 *
 * Requires EMPLOYEES:READ (GET) / EMPLOYEES:UPDATE (POST).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { educationSchema } from "@/lib/validations/employee-background";

const SELECT = {
  id: true, level: true, school: true, degree: true, fieldOfStudy: true,
  startYear: true, endYear: true, honors: true, notes: true,
  createdAt: true, updatedAt: true,
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } });
    if (!emp) return null;
    return tx.employeeEducation.findMany({
      where: { employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: [{ endYear: "desc" }, { startYear: "desc" }, { createdAt: "desc" }],
      select: SELECT,
    });
  });
  if (result === null) return notFound("Employee");
  return ok(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = educationSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } });
      if (!emp) return { notFound: true as const };
      const row = await tx.employeeEducation.create({
        data: { employeeId: id, tenantId: ctx.tenantId, createdByUserId: ctx.userId, ...parsed.data },
        select: SELECT,
      });
      return { row };
    });
    if ("notFound" in result) return notFound("Employee");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "CREATE",
      entity: "EmployeeEducation", entityId: result.row.id,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Education added", 201);
  } catch (e) {
    return serverError(e);
  }
}
