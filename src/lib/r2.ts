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

// Credentials/bucket accept S3_* names (any S3-compatible store, e.g. Sliplane
// Object Storage / MinIO) and fall back to the original R2_* names so existing
// Cloudflare R2 deployments keep working unchanged.
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "";
export const R2_PUBLIC_URL = process.env.S3_PUBLIC_URL ?? process.env.R2_PUBLIC_URL; // optional

// Explicit endpoint for any S3-compatible provider; otherwise derive the
// Cloudflare R2 endpoint from R2_ACCOUNT_ID (legacy behaviour).
const s3Endpoint =
  process.env.S3_ENDPOINT ??
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

/** True when the runtime has been configured with object-storage credentials. */
export function isR2Configured(): boolean {
  return Boolean(s3Endpoint && accessKeyId && secretAccessKey && R2_BUCKET);
}

let _client: S3Client | null = null;

/** Lazily-constructed S3 client for the configured object store. */
export function r2(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      "Object storage is not configured. Set S3_ENDPOINT + S3_ACCESS_KEY_ID + " +
      "S3_SECRET_ACCESS_KEY + S3_BUCKET (or the legacy R2_* equivalents).",
    );
  }
  if (!_client) {
    _client = new S3Client({
      // R2 uses "auto"; MinIO/Sliplane-style stores often need a real region.
      region: process.env.S3_REGION ?? "auto",
      endpoint: s3Endpoint,
      // Path-style addressing is required by many self-hosted S3 stores.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
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

/** Build a storage key for an employee's training certificate. */
export function buildEmployeeTrainingCertKey(opts: {
  tenantId: string;
  employeeId: string;
  fileName: string;
}): string {
  const ext = opts.fileName.includes(".")
    ? opts.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const uuid = crypto.randomUUID();
  return `tenants/${opts.tenantId}/employees/${opts.employeeId}/training/${uuid}.${ext}`;
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
