/**
 * POST /api/settings/tenant/logo/upload
 *
 * Accepts a multipart image field ("file") and uploads the company logo to
 * object storage server-side, returning the storage key. The caller PATCHes
 * /api/settings/tenant with the key to persist it.
 *
 * Server-side upload (browser -> our app -> storage) so no bucket CORS policy
 * is required.
 */

import type { NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { putObject, buildTenantLogoKey, isR2Configured } from "@/lib/r2";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

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

  const storageKey = buildTenantLogoKey({
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
