/**
 * POST /api/employees/[id]/documents/upload
 *
 * Uploads a single 201-file document to object storage server-side (multipart
 * "file" field) and returns the storage key. The browser then POSTs the
 * metadata + storageKey to /api/employees/[id]/documents to record the row.
 *
 * Server-side upload (browser -> our API -> bucket) — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { readUploadedFile } from "@/lib/server-upload";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/validations/document";
import { putObject, buildEmployeeDocumentKey, isR2Configured } from "@/lib/r2";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err(
      "File storage is not configured on the server. Contact your administrator.",
      503,
    );
  }

  const { id } = await params;

  // Verify employee is in this tenant
  const employee = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!employee) return notFound("Employee");

  const read = await readUploadedFile(req, {
    allowedTypes: ALLOWED_MIME_TYPES,
    maxBytes: MAX_FILE_SIZE,
    label: "Document",
  });
  if (read.error) return read.error;
  const { file } = read;

  const storageKey = buildEmployeeDocumentKey({
    tenantId: auth.tenantId,
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
