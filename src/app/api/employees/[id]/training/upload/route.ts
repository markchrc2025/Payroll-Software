/**
 * POST /api/employees/[id]/training/upload
 *
 * Uploads a training certificate to object storage server-side (multipart
 * "file" field) and returns the storage key, which is then sent back when
 * creating/updating the EmployeeTraining row.
 *
 * Requires EMPLOYEES:UPDATE. Server-side upload — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { readUploadedFile } from "@/lib/server-upload";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/validations/document";
import { putObject, buildEmployeeTrainingCertKey, isR2Configured } from "@/lib/r2";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const { id } = await params;

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!employee) return notFound("Employee");

  const read = await readUploadedFile(req, {
    allowedTypes: ALLOWED_MIME_TYPES,
    maxBytes: MAX_FILE_SIZE,
    label: "Certificate",
  });
  if (read.error) return read.error;
  const { file } = read;

  const storageKey = buildEmployeeTrainingCertKey({
    tenantId: ctx.tenantId,
    employeeId: id,
    fileName: file.name,
  });

  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return ok({ storageKey });
}
