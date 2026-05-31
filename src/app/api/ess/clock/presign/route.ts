/**
 * POST /api/ess/clock/presign
 *
 * Returns a short-lived presigned PUT URL the browser uses to upload a
 * clock-punch selfie directly to Cloudflare R2.
 *
 * Auth:  ESS Bearer token (getEssContext)
 *
 * Body: { fileName, mimeType, fileSize }
 *
 * Allowed types: image/jpeg, image/png, image/webp
 * Max size: 5 MB
 *
 * After the PUT succeeds, include the returned `storageKey` as `selfieKey`
 * in the POST /api/ess/clock body.
 */
import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured, buildSelfieKey } from "@/lib/r2";

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_SELFIE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const presignSelfieSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_SELFIE_TYPES, { error: "Unsupported image type" }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_SELFIE_SIZE, `Selfie must be ≤ ${MAX_SELFIE_SIZE / 1024 / 1024} MB`),
});

export async function POST(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Selfie capture is unavailable.",
      503
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = presignSelfieSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { fileName, mimeType, fileSize } = parsed.data;

  const storageKey = buildSelfieKey({
    tenantId: ess.tenantId,
    employeeId: ess.employeeId,
    fileName,
  });

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: fileSize,
  });

  // 5-minute upload window
  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  return ok({
    uploadUrl,
    storageKey,
    expiresIn: 60 * 5,
    method: "PUT",
    headers: { "Content-Type": mimeType },
  });
}
