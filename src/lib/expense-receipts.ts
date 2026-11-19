/**
 * Expense claim receipts (PAY-190). One place for where a receipt is stored,
 * which files are accepted, and whether a key may be saved on a claim of a
 * given company: a claim may only point at a receipt uploaded for its own
 * company, never at any other object in storage.
 */
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isR2Configured, putObject, r2, R2_BUCKET } from "@/lib/r2";
import { readUploadedFile } from "@/lib/server-upload";
import { err } from "@/lib/api-response";

export const MAX_RECEIPT_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export function receiptPrefix(tenantId: string): string {
  return `tenants/${tenantId}/receipts/`;
}

/** True when `key` is a receipt stored for this company (no path tricks). */
export function isTenantReceiptKey(tenantId: string, key: string): boolean {
  const prefix = receiptPrefix(tenantId);
  if (!key.startsWith(prefix)) return false;
  return /^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key.slice(prefix.length));
}

/** Reads the multipart "file" field and stores it; returns the key or an error response. */
export async function storeReceipt(req: Request, tenantId: string): Promise<{ key: string } | { error: Response }> {
  if (!isR2Configured()) {
    return { error: err("File storage is not configured on the server. Contact your administrator.", 503) };
  }
  const read = await readUploadedFile(req, { allowedTypes: ALLOWED_RECEIPT_TYPES, maxBytes: MAX_RECEIPT_SIZE, label: "Receipt" });
  if (read.error) return { error: read.error };
  const key = `${receiptPrefix(tenantId)}${crypto.randomUUID()}.${EXT[read.file.type] ?? "bin"}`;
  try {
    await putObject(key, Buffer.from(await read.file.arrayBuffer()), read.file.type);
  } catch (e) {
    return { error: err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502) };
  }
  return { key };
}

/** A 5-minute link to view the receipt, or null when storage is not configured. */
export async function receiptViewUrl(key: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 300 });
}
