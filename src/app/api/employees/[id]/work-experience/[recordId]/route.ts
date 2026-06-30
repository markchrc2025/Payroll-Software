/**
 * /api/employees/[id]/work-experience/[recordId]
 *   PUT    — replace a work-experience record
 *   DELETE — soft-delete a work-experience record
 *
 * Requires EMPLOYEES:UPDATE.
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id, recordId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = workExperienceSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.employeeWorkExperience.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { notFound: true as const };
      const row = await tx.employeeWorkExperience.update({
        where: { id: recordId }, data: parsed.data, select: SELECT,
      });
      return { row };
    });
    if ("notFound" in result) return notFound("Work experience");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "UPDATE",
      entity: "EmployeeWorkExperience", entityId: recordId,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Work experience updated");
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
      const existing = await tx.employeeWorkExperience.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { notFound: true as const };
      await tx.employeeWorkExperience.update({ where: { id: recordId }, data: { deletedAt: new Date() } });
      return { ok: true as const };
    });
    if ("notFound" in result) return notFound("Work experience");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "DELETE",
      entity: "EmployeeWorkExperience", entityId: recordId, changes: {}, ipAddress: getClientIp(req),
    });
    return ok({ id: recordId }, "Work experience removed");
  } catch (e) {
    return serverError(e);
  }
}
