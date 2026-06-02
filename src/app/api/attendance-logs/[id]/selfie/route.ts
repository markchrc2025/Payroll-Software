/**
 * GET /api/attendance-logs/[id]/selfie
 *
 * Serves the selfie image for a single attendance log.
 * - If R2 is configured and the log has a selfieKey → 302 redirect to a
 *   short-lived presigned R2 URL.
 * - If the log has inline selfieData (bytes) → stream JPEG inline.
 * - Otherwise → 404.
 */
import type { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { notFound } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const log = await withTenant(auth.tenantId, (tx) =>
    tx.attendanceLog.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, selfieKey: true, selfieData: true },
    })
  );

  if (!log) return notFound("Attendance log");

  // R2-backed selfie
  if (log.selfieKey && isR2Configured()) {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: log.selfieKey,
      ResponseContentType: "image/jpeg",
    });
    const presignedUrl = await getSignedUrl(r2(), command, { expiresIn: 300 });
    return Response.redirect(presignedUrl, 302);
  }

  // Inline DB-backed selfie
  if (log.selfieData) {
    return new Response(log.selfieData, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
    });
  }

  return notFound("Selfie");
}
