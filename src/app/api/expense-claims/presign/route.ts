/**
 * POST /api/expense-claims/presign
 *
 * Returns a short-lived presigned PUT URL the browser uses to upload a
 * receipt image directly to Cloudflare R2.
 *
 * After the PUT succeeds, the caller POSTs to /api/expense-claims with the
 * returned `storageKey` (saved as `receiptKey`) alongside the claim data.
 *
 * Body: { fileName, mimeType, fileSize }
 *
 * Allowed types: image/jpeg, image/png, image/webp, image/heic, application/pdf
 * Max size: 10 MB
 */
import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

const presignReceiptSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_RECEIPT_TYPES, { error: "Unsupported file type" }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_RECEIPT_SIZE, `Receipt must be ≤ ${MAX_RECEIPT_SIZE / 1024 / 1024} MB`),
});

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = presignReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { fileName, mimeType, fileSize } = parsed.data;

  // Build a tenant-scoped receipt key
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const storageKey = `tenants/${auth.tenantId}/receipts/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: fileSize,
  });

  // 5-minute upload window
  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  return ok(
    {
      uploadUrl,
      storageKey,
      expiresIn: 60 * 5,
      method: "PUT",
      headers: { "Content-Type": mimeType },
    },
    "Presigned URL created",
    201
  );
}
