/**
 * /api/employees/[id]/education/[recordId]
 *   PUT    — replace an education record
 *   DELETE — soft-delete an education record
 *
 * Requires EMPLOYEES:UPDATE.
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id, recordId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = educationSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.employeeEducation.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { notFound: true as const };
      const row = await tx.employeeEducation.update({
        where: { id: recordId }, data: parsed.data, select: SELECT,
      });
      return { row };
    });
    if ("notFound" in result) return notFound("Education record");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "UPDATE",
      entity: "EmployeeEducation", entityId: recordId,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Education updated");
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id, recordId } = await params;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.employeeEducation.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { notFound: true as const };
      await tx.employeeEducation.update({ where: { id: recordId }, data: { deletedAt: new Date() } });
      return { ok: true as const };
    });
    if ("notFound" in result) return notFound("Education record");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "DELETE",
      entity: "EmployeeEducation", entityId: recordId, changes: {}, ipAddress: getClientIp(req),
    });
    return ok({ id: recordId }, "Education removed");
  } catch (e) {
    return serverError(e);
  }
}
