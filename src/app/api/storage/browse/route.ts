/**
 * GET /api/storage/browse?prefix=<key-prefix>
 *
 * Lists the configured object-storage bucket one "folder" level at a time
 * (ListObjectsV2 with a "/" delimiter), server-side — the in-app Storage
 * browser exists because some providers (e.g. Sliplane Object Storage) offer
 * no bucket browser UI, and browser->bucket calls are blocked by CORS anyway.
 *
 * Tenant users are confined to their own `tenants/{tenantId}/` subtree; the
 * requested prefix is validated against it. SUPER_ADMIN sees the whole bucket.
 * Requires SETTINGS:READ.
 */

import type { NextRequest } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  if (!isR2Configured()) {
    return err("File storage is not configured on the server.", 503);
  }

  // Tenant users may only browse their own subtree.
  const basePrefix =
    auth.systemRole === "SUPER_ADMIN" ? "" : `tenants/${auth.tenantId}/`;

  const requested = req.nextUrl.searchParams.get("prefix") ?? basePrefix;
  const prefix = requested || basePrefix;
  if (prefix.includes("..") || !prefix.startsWith(basePrefix)) {
    return err("Invalid prefix.", 400);
  }

  try {
    const res = await r2().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: 500,
      }),
    );

    const folders = (res.CommonPrefixes ?? [])
      .map((p) => p.Prefix)
      .filter((p): p is string => Boolean(p));

    const files = (res.Contents ?? [])
      // The prefix itself can come back as a zero-byte "directory marker".
      .filter((o) => o.Key && o.Key !== prefix)
      .map((o) => ({
        key: o.Key as string,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
      }));

    return ok({
      basePrefix,
      prefix,
      folders,
      files,
      truncated: res.IsTruncated ?? false,
    });
  } catch (e) {
    return err(
      `Could not list storage: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  }
}
