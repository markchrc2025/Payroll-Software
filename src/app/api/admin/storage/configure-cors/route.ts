/**
 * POST /api/admin/storage/configure-cors
 *
 * One-time admin utility: applies a browser-upload CORS policy to the
 * configured object-storage bucket, so direct presigned PUT/GET from the app
 * origin is allowed. Needed for S3-compatible providers (e.g. Sliplane Object
 * Storage) whose dashboard exposes no CORS setting. Idempotent — running it
 * again just re-applies the same policy.
 *
 * Trigger it once from the browser console while signed in as an admin:
 *   fetch("/api/admin/storage/configure-cors", { method: "POST" })
 *     .then((r) => r.json()).then(console.log)
 */

import type { NextRequest } from "next/server";
import { PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;

  if (!isR2Configured()) {
    return err("Object storage is not configured on the server.", 503);
  }

  // Origins allowed to upload/read directly from the browser. NEXT_PUBLIC_APP_URL
  // is the canonical app origin; the production domain is included explicitly so
  // this still works even if that env var is unset.
  const origins = Array.from(
    new Set(
      [process.env.NEXT_PUBLIC_APP_URL, "https://payroll.sentire.solutions"].filter(
        (o): o is string => Boolean(o),
      ),
    ),
  );

  const corsRules = [
    {
      AllowedOrigins: origins,
      AllowedMethods: ["GET", "PUT", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3000,
    },
  ];

  try {
    await r2().send(
      new PutBucketCorsCommand({
        Bucket: R2_BUCKET,
        CORSConfiguration: { CORSRules: corsRules },
      }),
    );
  } catch (e) {
    return err(
      `Failed to apply CORS policy: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  }

  // Read it back so the caller can confirm what the bucket now reports. Some
  // S3-compatible stores don't implement GetBucketCors — the PUT still applied.
  let applied: unknown = corsRules;
  try {
    const res = await r2().send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
    applied = res.CORSRules ?? corsRules;
  } catch {
    /* GetBucketCors unsupported — ignore, the PUT above succeeded */
  }

  return ok(
    { bucket: R2_BUCKET, origins, cors: applied },
    "CORS policy applied. Browser uploads should now be allowed.",
  );
}
