/**
 * POST /api/kiosk/upload
 *
 * Uploads a clock-punch selfie to object storage server-side before the kiosk
 * submits the punch. Multipart fields:
 *   file           — the selfie (image/jpeg | png | webp, ≤ 5 MB)
 *   employeeNumber — scopes the selfie to the correct employee path
 *
 * Auth:  Authorization: Kiosk <deviceToken>
 * Server-side upload — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import prismaAdmin from "@/lib/prisma-admin";
import { ok, err } from "@/lib/api-response";
import { putObject, buildSelfieKey, isR2Configured } from "@/lib/r2";

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_SELFIE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function getKiosk(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Kiosk ")) return null;
  const deviceToken = authHeader.slice(6).trim();
  if (!deviceToken) return null;
  const kiosk = await prismaAdmin.kiosk.findFirst({
    where: { deviceToken, isActive: true, deletedAt: null },
    select: { id: true, tenantId: true },
  });
  return kiosk ?? null;
}

export async function POST(req: NextRequest) {
  const kiosk = await getKiosk(req);
  if (!kiosk) return err("Invalid or inactive kiosk device token", 401);

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Selfie capture is unavailable.",
      503,
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return err("Expected a multipart/form-data request.", 400);

  const employeeNumber = String(form.get("employeeNumber") ?? "").trim();
  if (!employeeNumber) return err("employeeNumber is required.", 400);

  const file = form.get("file");
  if (!(file instanceof File)) return err("No file provided.", 400);
  if (!ALLOWED_SELFIE_TYPES.includes(file.type)) {
    return err("Unsupported image type.", 400);
  }
  if (file.size <= 0 || file.size > MAX_SELFIE_SIZE) {
    return err("Selfie must be ≤ 5 MB.", 400);
  }

  // Look up employee by employeeNumber within the kiosk's tenant
  const employee = await prismaAdmin.employee.findFirst({
    where: { employeeNumber, tenantId: kiosk.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return err("Employee not found", 404);

  const storageKey = buildSelfieKey({
    tenantId: kiosk.tenantId,
    employeeId: employee.id,
    fileName: file.name || "selfie.jpg",
  });

  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return ok({ storageKey });
}
