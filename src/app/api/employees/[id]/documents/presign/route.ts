/**
 * POST /api/employees/[id]/documents/presign
 *
 * Returns a short-lived presigned PUT URL the browser can use to upload a
 * single 201-file document directly to Cloudflare R2. After the PUT
 * succeeds, the browser POSTs the metadata + storageKey back to
 * /api/employees/[id]/documents to record the row.
 */

import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { presignUploadSchema } from "@/lib/validations/document";
import {
  r2,
  R2_BUCKET,
  buildEmployeeDocumentKey,
  isR2Configured,
} from "@/lib/r2";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503
    );
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = presignUploadSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  // Verify employee is in this tenant
  const employee = await withTenant(auth.tenantId, (tx) => tx.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    select: { id: true },
  }));
  if (!employee) return notFound("Employee");

  const storageKey = buildEmployeeDocumentKey({
    tenantId: auth.tenantId,
    employeeId: id,
    fileName: parsed.data.fileName,
  });

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: parsed.data.mimeType,
    ContentLength: parsed.data.fileSize,
  });

  // 5-minute upload window
  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  return ok({
    uploadUrl,
    storageKey,
    expiresIn: 60 * 5,
    method: "PUT",
    headers: {
      "Content-Type": parsed.data.mimeType,
    },
  });
}
