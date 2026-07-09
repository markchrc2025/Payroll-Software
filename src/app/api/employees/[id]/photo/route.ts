/**
 * GET /api/employees/[id]/photo
 *
 * Serves an employee's profile photo. Redirects (302) to a public R2 URL when
 * configured, otherwise to a short-lived presigned GET URL. 404 when the
 * employee has no photo.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound, err } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { resolveObjectUrl, isR2Configured } from "@/lib/r2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const employee = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { photoKey: true },
    }),
  );
  if (!employee) return notFound("Employee");
  if (!employee.photoKey) return notFound("Photo");
  if (!isR2Configured()) return err("File storage is not configured.", 503);

  const url = await resolveObjectUrl(employee.photoKey, { contentType: "image/jpeg" });
  if (!url) return err("File storage is not configured.", 503);
  return Response.redirect(url, 302);
}

/**
 * PATCH /api/employees/[id]/photo — attach (or clear) a profile photo after it
 * has been uploaded to object storage via /api/employees/photo/upload.
 * Body: { photoKey: string | null }. Requires EMPLOYEES:UPDATE.
 */
const patchSchema = z.object({ photoKey: z.string().min(1).max(500).nullable() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const photoKey = parsed.data.photoKey;
  if (photoKey && !photoKey.startsWith(`tenants/${auth.tenantId}/employee-photos/`)) {
    return err("photoKey does not belong to this tenant", 400);
  }

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { notFound: true as const };
    await tx.employee.update({ where: { id: emp.id }, data: { photoKey } });
    return { id: emp.id };
  });
  if ("notFound" in result) return notFound("Employee");

  void writeAuditLog({
    tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE",
    entity: "Employee", entityId: result.id,
    changes: { field: "photoKey", set: !!photoKey }, ipAddress: getClientIp(req),
  });
  return ok({ id: result.id }, photoKey ? "Photo updated" : "Photo removed");
}
