/**
 * GET /api/employees/[id]/photo
 *
 * Serves an employee's profile photo. Redirects (302) to a public R2 URL when
 * configured, otherwise to a short-lived presigned GET URL. 404 when the
 * employee has no photo.
 */

import type { NextRequest } from "next/server";

import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { notFound, err } from "@/lib/api-response";
import { resolveObjectUrl, isR2Configured } from "@/lib/r2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const employee = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { photoKey: true },
    }),
  );
  if (!employee) return notFound("Employee");
  if (!employee.photoKey) return notFound("Photo");
  if (!isR2Configured()) return err("File storage is not configured.", 503);

  const url = await resolveObjectUrl(employee.photoKey, { contentType: "image/jpeg" });
  if (!url) return err("File storage is not configured.", 503);
  return Response.redirect(url, 302);
}
