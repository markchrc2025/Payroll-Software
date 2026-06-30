/**
 * POST /api/employees/[id]/training/presign
 *
 * Returns a short-lived presigned PUT URL the browser uses to upload a single
 * training certificate directly to Cloudflare R2. The returned storageKey is
 * then sent back when creating/updating the EmployeeTraining row.
 *
 * Requires EMPLOYEES:UPDATE.
 */
import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { r2, R2_BUCKET, buildEmployeeTrainingCertKey, isR2Configured } from "@/lib/r2";
import { trainingCertPresignSchema } from "@/lib/validations/employee-background";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  if (!isR2Configured()) {
    return err("File storage is not configured on the server. Contact your administrator.", 503);
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = trainingCertPresignSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } }),
  );
  if (!employee) return notFound("Employee");

  const storageKey = buildEmployeeTrainingCertKey({ tenantId: ctx.tenantId, employeeId: id, fileName: parsed.data.fileName });

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: parsed.data.mimeType,
    ContentLength: parsed.data.fileSize,
  });
  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  return ok({
    uploadUrl,
    storageKey,
    expiresIn: 60 * 5,
    method: "PUT",
    headers: { "Content-Type": parsed.data.mimeType },
  });
}
