/**
 * POST /api/ess/clock/upload
 *
 * Uploads a clock-punch selfie to object storage server-side (multipart
 * "file" field) and returns the storage key, which is then included as
 * `selfieKey` in the POST /api/ess/clock body.
 *
 * Auth:  ESS Bearer token (getEssContext)
 * Server-side upload — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import { getEssContext } from "@/lib/ess-auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { readUploadedFile } from "@/lib/server-upload";
import { putObject, buildSelfieKey, isR2Configured } from "@/lib/r2";

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_SELFIE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Selfie capture is unavailable.",
      503,
    );
  }

  const read = await readUploadedFile(req, {
    allowedTypes: ALLOWED_SELFIE_TYPES,
    maxBytes: MAX_SELFIE_SIZE,
    label: "Selfie",
  });
  if (read.error) return read.error;
  const { file } = read;

  const storageKey = buildSelfieKey({
    tenantId: ess.tenantId,
    employeeId: ess.employeeId,
    fileName: file.name || "selfie.jpg",
  });

  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return ok({ storageKey });
}
