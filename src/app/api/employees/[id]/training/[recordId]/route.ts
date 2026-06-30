/**
 * /api/employees/[id]/training/[recordId]
 *   PUT    — replace a training record (cleans up a replaced certificate)
 *   DELETE — soft-delete a training record (removes its R2 certificate)
 *
 * Requires EMPLOYEES:UPDATE.
 */
import type { NextRequest } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";
import { trainingSchema } from "@/lib/validations/employee-background";

const SELECT = {
  id: true, title: true, provider: true, trainingDate: true, hours: true,
  certificateKey: true, certificateFileName: true, certificateMimeType: true,
  certificateFileSize: true, expiresAt: true, notes: true,
  createdAt: true, updatedAt: true,
} as const;

function certPrefix(tenantId: string, employeeId: string) {
  return `tenants/${tenantId}/employees/${employeeId}/training/`;
}

/** Best-effort R2 object delete — never throws. */
async function removeObject(key: string | null | undefined) {
  if (!key || !isR2Configured()) return;
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (e) {
    console.error("[training] R2 delete failed (continuing):", e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id, recordId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = trainingSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  if (parsed.data.certificateKey && !parsed.data.certificateKey.startsWith(certPrefix(ctx.tenantId, id))) {
    return err("certificateKey does not belong to this employee", 400);
  }

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.employeeTraining.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, certificateKey: true },
      });
      if (!existing) return { notFound: true as const };
      const row = await tx.employeeTraining.update({
        where: { id: recordId }, data: parsed.data, select: SELECT,
      });
      return { row, oldKey: existing.certificateKey };
    });
    if ("notFound" in result) return notFound("Training");
    // Clean up a replaced/removed certificate object.
    if (result.oldKey && result.oldKey !== parsed.data.certificateKey) {
      await removeObject(result.oldKey);
    }
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "UPDATE",
      entity: "EmployeeTraining", entityId: recordId,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Training updated");
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
      const existing = await tx.employeeTraining.findFirst({
        where: { id: recordId, employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, certificateKey: true },
      });
      if (!existing) return { notFound: true as const };
      await tx.employeeTraining.update({ where: { id: recordId }, data: { deletedAt: new Date() } });
      return { oldKey: existing.certificateKey };
    });
    if ("notFound" in result) return notFound("Training");
    await removeObject(result.oldKey);
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "DELETE",
      entity: "EmployeeTraining", entityId: recordId, changes: {}, ipAddress: getClientIp(req),
    });
    return ok({ id: recordId }, "Training removed");
  } catch (e) {
    return serverError(e);
  }
}
