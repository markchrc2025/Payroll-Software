/**
 * /api/employees/[id]/documents
 *   GET  — list 201-file documents for an employee
 *   POST — finalize a completed R2 upload (persist metadata after PUT to presigned URL)
 *
 * Upload flow:
 *   1. Browser POSTs metadata to /api/employees/[id]/documents/presign
 *      → server returns { uploadUrl, storageKey }
 *   2. Browser PUTs the file directly to uploadUrl (Cloudflare R2)
 *   3. Browser POSTs to this endpoint with the storageKey + metadata
 *      → row persisted in EmployeeDocument
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { finalizeDocumentSchema } from "@/lib/validations/document";

// ---------------------------------------------------------------------------
// GET — list documents for the employee
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  // Confirm the employee belongs to this tenant
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return notFound("Employee");

  const documents = await prisma.employeeDocument.findMany({
    where: {
      employeeId: id,
      tenantId: auth.tenantId,
      deletedAt: null,
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      category: true,
      title: true,
      description: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      isConfidential: true,
      createdAt: true,
      uploadedByUserId: true,
    },
  });

  return ok(documents);
}

// ---------------------------------------------------------------------------
// POST — finalize an upload by recording the document metadata
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = finalizeDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  // Verify employee is in this tenant
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return notFound("Employee");

  // Sanity-check the storage key actually belongs to this employee in this
  // tenant — prevents a caller from registering somebody else's upload.
  const expectedPrefix = `tenants/${auth.tenantId}/employees/${id}/documents/`;
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return err("storageKey does not belong to this employee", 400);
  }

  try {
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        tenantId: auth.tenantId,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        isConfidential: parsed.data.isConfidential,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        fileSize: parsed.data.fileSize,
        storageKey: parsed.data.storageKey,
        uploadedByUserId: auth.userId,
      },
      select: {
        id: true,
        category: true,
        title: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        isConfidential: true,
        createdAt: true,
      },
    });
    return ok(doc, "Document uploaded", 201);
  } catch (e) {
    return serverError(e);
  }
}
