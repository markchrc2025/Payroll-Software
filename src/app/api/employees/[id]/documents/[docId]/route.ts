/**
 * /api/employees/[id]/documents/[docId]
 *   GET    — return a short-lived presigned download URL (302 redirect option via ?redirect=1)
 *   DELETE — soft-delete the document row (the R2 object is also removed)
 */

import type { NextRequest } from "next/server";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";

// ---------------------------------------------------------------------------
// GET — issue a presigned download URL
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  if (!isR2Configured()) {
    return err("File storage is not configured on the server.", 503);
  }

  const { id, docId } = await params;

  const doc = await withTenant(auth.tenantId, (tx) => tx.employeeDocument.findFirst({
    where: {
      id: docId,
      employeeId: id,
      tenantId: auth.tenantId,
      deletedAt: null,
    },
  }));
  if (!doc) return notFound("Document");

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: doc.storageKey,
    ResponseContentDisposition: `attachment; filename="${doc.fileName.replace(
      /"/g,
      ""
    )}"`,
  });
  const downloadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 5 });

  // ?redirect=1 → browser hits this and gets a 302 straight to R2
  if (req.nextUrl.searchParams.get("redirect") === "1") {
    return Response.redirect(downloadUrl, 302);
  }

  return ok({ downloadUrl, expiresIn: 60 * 5, fileName: doc.fileName });
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete the row + remove the R2 object
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id, docId } = await params;

  const doc = await withTenant(auth.tenantId, (tx) => tx.employeeDocument.findFirst({
    where: {
      id: docId,
      employeeId: id,
      tenantId: auth.tenantId,
      deletedAt: null,
    },
  }));
  if (!doc) return notFound("Document");

  try {
    // Best-effort R2 delete — proceed with DB soft-delete even if it fails
    if (isR2Configured()) {
      try {
        await r2().send(
          new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: doc.storageKey })
        );
      } catch (e) {
        console.error("R2 delete failed (continuing with soft-delete):", e);
      }
    }

    await withTenant(auth.tenantId, (tx) => tx.employeeDocument.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    }));

    return ok({ id: docId }, "Document deleted");
  } catch (e) {
    return serverError(e);
  }
}
