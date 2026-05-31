/**
 * POST /api/kiosk/presign
 *
 * Returns a short-lived presigned PUT URL the kiosk device uses to upload a
 * clock-punch selfie directly to Cloudflare R2 before submitting the punch.
 *
 * Auth:  Authorization: Kiosk <deviceToken>
 *
 * Body: { employeeId, fileName, mimeType, fileSize }
 *
 * employeeId is required so the selfie is scoped to the correct employee path.
 * Allowed types: image/jpeg, image/png, image/webp
 * Max size: 5 MB
 */
import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { ok, err } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured, buildSelfieKey } from "@/lib/r2";

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_SELFIE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const bodySchema = z.object({
  employeeNumber: z.string().min(1),
  fileName:       z.string().min(1).max(255),
  mimeType:       z.enum(ALLOWED_SELFIE_TYPES, { error: "Unsupported image type" }),
  fileSize:       z
    .number()
    .int()
    .positive()
    .max(MAX_SELFIE_SIZE, `Selfie must be ≤ ${MAX_SELFIE_SIZE / 1024 / 1024} MB`),
});

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
      503
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { employeeNumber, fileName, mimeType, fileSize } = parsed.data;

  // Look up employee by employeeNumber within the kiosk's tenant
  const employee = await prismaAdmin.employee.findFirst({
    where: { employeeNumber, tenantId: kiosk.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return err("Employee not found", 404);

  const storageKey = buildSelfieKey({
    tenantId: kiosk.tenantId,
    employeeId: employee.id,
    fileName,
  });

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: fileSize,
  });

  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  return ok({
    uploadUrl,
    storageKey,
    expiresIn: 60 * 5,
    method: "PUT",
    headers: { "Content-Type": mimeType },
  });
}
