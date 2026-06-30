/**
 * /api/employees/[id]/work-experience
 *   GET  — list an employee's prior work experience
 *   POST — add a work-experience record
 *
 * Requires EMPLOYEES:READ (GET) / EMPLOYEES:UPDATE (POST).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { workExperienceSchema } from "@/lib/validations/employee-background";

const SELECT = {
  id: true, companyName: true, position: true, startDate: true, endDate: true,
  location: true, description: true, reasonForLeaving: true,
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
    return tx.employeeWorkExperience.findMany({
      where: { employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
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
  const parsed = workExperienceSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } });
      if (!emp) return { notFound: true as const };
      const row = await tx.employeeWorkExperience.create({
        data: { employeeId: id, tenantId: ctx.tenantId, createdByUserId: ctx.userId, ...parsed.data },
        select: SELECT,
      });
      return { row };
    });
    if ("notFound" in result) return notFound("Employee");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "CREATE",
      entity: "EmployeeWorkExperience", entityId: result.row.id,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Work experience added", 201);
  } catch (e) {
    return serverError(e);
  }
}
