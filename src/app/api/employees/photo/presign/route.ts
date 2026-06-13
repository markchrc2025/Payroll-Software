/**
 * POST /api/employees/photo/presign
 *
 * Returns a short-lived presigned PUT URL the browser uses to upload an
 * employee profile photo directly to Cloudflare R2. Used by the "Add employee"
 * wizard before the Employee row exists, so the key is namespaced by tenant.
 * The returned storageKey is submitted as `photoKey` when creating/updating
 * the employee.
 */

import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { imagePresignSchema } from "@/lib/validations/image-upload";
import { r2, R2_BUCKET, buildEmployeePhotoKey, isR2Configured } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = imagePresignSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const storageKey = buildEmployeePhotoKey({
    tenantId: auth.tenantId,
    fileName: parsed.data.fileName,
  });

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
