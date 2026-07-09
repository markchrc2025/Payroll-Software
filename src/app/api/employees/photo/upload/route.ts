/**
 * POST /api/employees/photo/upload
 *
 * Accepts a multipart image field ("file") and uploads it to object storage
 * server-side, returning the stable storage key (persisted later as `photoKey`).
 *
 * The browser posts the file to us (same-origin — no storage CORS needed) and
 * the server does the PutObject. Used by both the Add-employee wizard (before
 * the Employee row exists, so the key is tenant-namespaced) and the profile
 * avatar control.
 */

import type { NextRequest } from "next/server";

import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { putObject, buildEmployeePhotoKey, isR2Configured } from "@/lib/r2";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err("No file provided.", 400);
  if (!ACCEPTED.includes(file.type)) {
    return err("Please upload a JPG, PNG, or WebP image.", 400);
  }
  if (file.size > MAX_BYTES) return err("Image must be 5 MB or smaller.", 400);

  const storageKey = buildEmployeePhotoKey({
    tenantId: auth.tenantId,
    fileName: file.name,
  });

  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return ok({ storageKey });
}
