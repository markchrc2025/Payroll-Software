/**
 * POST /api/settings/tenant/logo/presign
 *
 * Returns a short-lived presigned PUT URL the browser uses to upload the
 * company logo directly to Cloudflare R2. After the PUT succeeds, the browser
 * PATCHes /api/settings/tenant with the returned storageKey to persist it.
 */

import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { imagePresignSchema } from "@/lib/validations/image-upload";
import { r2, R2_BUCKET, buildTenantLogoKey, isR2Configured } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = imagePresignSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const storageKey = buildTenantLogoKey({
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
