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
 *   companies/{companyId}/employees/{employeeId}/documents/{uuid}.{ext}
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
  companyId: string;
  employeeId: string;
  fileName: string;
}): string {
  const ext = opts.fileName.includes(".")
    ? opts.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const uuid = crypto.randomUUID();
  return `companies/${opts.companyId}/employees/${opts.employeeId}/documents/${uuid}.${ext}`;
}
