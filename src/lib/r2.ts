/**
 * Cloudflare R2 client (S3-compatible API).
 *
 * Env vars (set in .env.local):
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name (e.g. "sentire-payroll-201files")
 *   R2_PUBLIC_URL         — optional public custom domain; when unset, downloads
 *                           always use presigned GET URLs (recommended for
 *                           confidential HR files)
 *
 * Storage key convention:
 *   tenants/{tenantId}/employees/{employeeId}/documents/{uuid}.{ext}
 *
 * Always use presigned URLs for both upload and download — never expose
 * the access keys to the browser.
 */

import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET ?? "";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // optional

/** True when the runtime has been configured with R2 credentials. */
export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && R2_BUCKET);
}

let _client: S3Client | null = null;

/** Lazily-constructed S3 client pointing at the R2 endpoint. */
export function r2(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in .env.local."
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return _client;
}

/** Build a stable storage key for an employee document. */
export function buildEmployeeDocumentKey(opts: {
  tenantId: string;
  employeeId: string;
  fileName: string;
}): string {
  const ext = opts.fileName.includes(".")
    ? opts.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const uuid = crypto.randomUUID();
  return `tenants/${opts.tenantId}/employees/${opts.employeeId}/documents/${uuid}.${ext}`;
}

/** Build a storage key for a clock-punch selfie. */
export function buildSelfieKey(opts: {
  tenantId: string;
  employeeId: string;
  fileName: string;
}): string {
  const ext = opts.fileName.includes(".")
    ? opts.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "jpg";
  const uuid = crypto.randomUUID();
  return `tenants/${opts.tenantId}/selfies/${opts.employeeId}/${uuid}.${ext}`;
}

function imageExt(fileName: string): string {
  return fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "png";
}

/** Build a storage key for an uploaded company logo. */
export function buildTenantLogoKey(opts: {
  tenantId: string;
  fileName: string;
}): string {
  const uuid = crypto.randomUUID();
  return `tenants/${opts.tenantId}/branding/logo-${uuid}.${imageExt(opts.fileName)}`;
}

/**
 * Build a storage key for an uploaded employee profile photo.
 *
 * Photos are uploaded from the "Add employee" wizard before the Employee row
 * exists, so the key is namespaced by tenant rather than by employee id.
 */
export function buildEmployeePhotoKey(opts: {
  tenantId: string;
  fileName: string;
}): string {
  const uuid = crypto.randomUUID();
  return `tenants/${opts.tenantId}/employee-photos/${uuid}.${imageExt(opts.fileName)}`;
}

/**
 * Resolve a stored object key to a browser-loadable URL. When a public R2
 * domain is configured we return the stable public URL; otherwise we mint a
 * short-lived presigned GET URL. Returns null when R2 is not configured.
 */
export async function resolveObjectUrl(
  storageKey: string,
  opts: { expiresIn?: number; contentType?: string } = {},
): Promise<string | null> {
  if (!isR2Configured()) return null;
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
  });
  return getSignedUrl(r2(), command, { expiresIn: opts.expiresIn ?? 300 });
}
