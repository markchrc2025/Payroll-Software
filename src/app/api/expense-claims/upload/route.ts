/**
 * POST /api/expense-claims/upload
 *
 * Uploads a receipt (image or PDF) to object storage server-side (multipart
 * "file" field) and returns the storage key, which the caller saves as
 * `receiptKey` when POSTing the claim to /api/expense-claims.
 *
 * Allowed types: image/jpeg, image/png, image/webp, image/heic, application/pdf
 * Max size: 10 MB. Server-side upload — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { readUploadedFile } from "@/lib/server-upload";
import { putObject, isR2Configured } from "@/lib/r2";

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const read = await readUploadedFile(req, {
    allowedTypes: ALLOWED_RECEIPT_TYPES,
    maxBytes: MAX_RECEIPT_SIZE,
    label: "Receipt",
  });
  if (read.error) return read.error;
  const { file } = read;

  // Build a tenant-scoped receipt key
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const storageKey = `tenants/${auth.tenantId}/receipts/${crypto.randomUUID()}.${ext}`;

  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return ok({ storageKey });
}
