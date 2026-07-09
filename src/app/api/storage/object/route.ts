/**
 * /api/storage/object?key=<storage-key> — single-object operations for the
 * in-app Storage browser.
 *
 *   GET    → 302 redirect to a short-lived presigned download URL (top-level
 *            navigation, so bucket CORS never applies). Requires SETTINGS:READ.
 *   DELETE → permanently removes the object. Requires SETTINGS:UPDATE.
 *
 * Tenant users are confined to keys under their own `tenants/{tenantId}/`
 * subtree; SUPER_ADMIN may operate on any key.
 */

import type { NextRequest } from "next/server";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";
import type { AuthContext } from "@/lib/auth";

/** Validate + tenant-scope the requested key; returns null when not allowed. */
function allowedKey(req: NextRequest, auth: AuthContext): string | null {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key || key.includes("..")) return null;
  if (auth.systemRole === "SUPER_ADMIN") return key;
  return key.startsWith(`tenants/${auth.tenantId}/`) ? key : null;
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;

  if (!isR2Configured()) return err("File storage is not configured.", 503);

  const key = allowedKey(req, guard.ctx);
  if (!key) return err("Invalid key.", 400);

  const fileName = key.split("/").pop() ?? "download";
  const url = await getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
    }),
    { expiresIn: 300 },
  );
  return Response.redirect(url, 302);
}

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  if (!isR2Configured()) return err("File storage is not configured.", 503);

  const key = allowedKey(req, auth);
  if (!key) return err("Invalid key.", 400);

  try {
    await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (e) {
    return err(
      `Could not delete the file: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  }

  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "DELETE",
    entity: "StorageObject",
    entityId: key,
    changes: { key },
    ipAddress: getClientIp(req),
  });

  return ok({ key }, "File deleted");
}
