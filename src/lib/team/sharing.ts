/**
 * Wave F3 (PAY-216): Document and Form Sharing. HR shares a file (handbook,
 * policy, a form to download) with an audience. Files are versioned; when a
 * document asks for an "I have read and understood" acknowledgement, each
 * version needs its own, so a new version asks everyone again. The tracker
 * lists who in the audience has and has not acknowledged the current one.
 *
 * Files go to object storage when it is configured, else into the database
 * (at most 10 MB), as selfies do.
 */
import type { Prisma } from "@prisma/client";
import { isR2Configured, putObject, r2, R2_BUCKET } from "@/lib/r2";
import { asAudience, audienceEmployees, inAudience, type Audience } from "./audience";

type Tx = Prisma.TransactionClient;
export const MAX_SHARED_FILE = 10 * 1024 * 1024;

export class SharingRefusal extends Error {
  constructor(message: string, public status: 403 | 404 | 409 | 422 = 422) { super(message); }
}

export type Upload = { fileName: string; mimeType: string; bytes: Uint8Array };

async function store(tenantId: string, documentId: string, version: number, f: Upload) {
  if (f.bytes.byteLength === 0) throw new SharingRefusal("The file is empty");
  if (f.bytes.byteLength > MAX_SHARED_FILE) throw new SharingRefusal("The file is over 10 MB");
  if (isR2Configured()) {
    const key = `tenants/${tenantId}/shared/${documentId}/v${version}/${f.fileName.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
    await putObject(key, f.bytes, f.mimeType);
    return { storageKey: key, data: null };
  }
  return { storageKey: null, data: new Uint8Array(f.bytes) };
}

export async function shareDocument(tx: Tx, tenantId: string, userId: string | null, meta: { title: string; description: string | null; audience: Audience; requiresAck: boolean }, f: Upload) {
  if (!meta.title.trim()) throw new SharingRefusal("Give the document a title");
  const doc = await tx.sharedDocument.create({ data: { tenantId, title: meta.title.trim(), description: meta.description, audience: meta.audience, requiresAck: meta.requiresAck, createdByUserId: userId } });
  await tx.sharedDocumentVersion.create({ data: { tenantId, documentId: doc.id, version: 1, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.bytes.byteLength, uploadedByUserId: userId, ...(await store(tenantId, doc.id, 1, f)) } });
  return doc;
}

export async function addVersion(tx: Tx, tenantId: string, userId: string | null, documentId: string, f: Upload, note: string | null) {
  const doc = await tx.sharedDocument.findFirst({ where: { id: documentId, tenantId, deletedAt: null } });
  if (!doc) throw new SharingRefusal("Document not found", 404);
  const version = doc.currentVersion + 1;
  await tx.sharedDocumentVersion.create({ data: { tenantId, documentId, version, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.bytes.byteLength, note, uploadedByUserId: userId, ...(await store(tenantId, documentId, version, f)) } });
  return tx.sharedDocument.update({ where: { id: documentId }, data: { currentVersion: version } });
}

/** The documents an employee is in the audience of, with what they still need to acknowledge. */
export async function employeeDocuments(tx: Tx, tenantId: string, employeeId: string) {
  const me = await tx.employee.findFirst({ where: { id: employeeId, tenantId }, select: { departmentId: true, branchId: true } });
  if (!me) return [];
  const docs = await tx.sharedDocument.findMany({ where: { tenantId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1, select: { fileName: true, createdAt: true, note: true } }, acks: { where: { employeeId } } }, orderBy: { updatedAt: "desc" } });
  return docs.filter((d) => inAudience(asAudience(d.audience), me)).map((d) => ({
    id: d.id, title: d.title, description: d.description, version: d.currentVersion, fileName: d.versions[0]?.fileName ?? null, updatedAt: d.versions[0]?.createdAt ?? d.updatedAt, note: d.versions[0]?.note ?? null,
    requiresAck: d.requiresAck, acknowledged: d.acks.some((a) => a.version === d.currentVersion),
  }));
}

export async function acknowledge(tx: Tx, tenantId: string, employeeId: string, documentId: string) {
  const list = await employeeDocuments(tx, tenantId, employeeId);
  const d = list.find((x) => x.id === documentId);
  if (!d) throw new SharingRefusal("Document not found", 404);
  if (!d.requiresAck) throw new SharingRefusal("This document asks for no acknowledgement", 409);
  await tx.sharedDocumentAck.upsert({
    where: { documentId_version_employeeId: { documentId, version: d.version, employeeId } },
    create: { tenantId, documentId, version: d.version, employeeId }, update: {},
  });
  return { version: d.version };
}

/** Who in the audience has and has not acknowledged the current version. */
export async function tracker(tx: Tx, tenantId: string, documentId: string) {
  const d = await tx.sharedDocument.findFirst({ where: { id: documentId, tenantId, deletedAt: null } });
  if (!d) throw new SharingRefusal("Document not found", 404);
  const people = await audienceEmployees(tx, tenantId, asAudience(d.audience));
  const acks = await tx.sharedDocumentAck.findMany({ where: { documentId, version: d.currentVersion } });
  const at = new Map(acks.map((a) => [a.employeeId, a.acknowledgedAt]));
  return {
    version: d.currentVersion,
    rows: people.map((p) => ({ employeeId: p.id, employeeNumber: p.employeeNumber, name: `${p.lastName}, ${p.firstName}`, acknowledgedAt: at.get(p.id) ?? null })),
  };
}

/** A version's file (the current one when none is given). */
export async function fileOf(tx: Tx, tenantId: string, documentId: string, version?: number) {
  const d = await tx.sharedDocument.findFirst({ where: { id: documentId, tenantId, deletedAt: null } });
  if (!d) throw new SharingRefusal("Document not found", 404);
  const v = await tx.sharedDocumentVersion.findUnique({ where: { documentId_version: { documentId, version: version ?? d.currentVersion } } });
  if (!v) throw new SharingRefusal("Version not found", 404);
  let bytes: Uint8Array;
  if (v.data) bytes = new Uint8Array(v.data);
  else {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: v.storageKey! }));
    bytes = new Uint8Array(await out.Body!.transformToByteArray());
  }
  return { fileName: v.fileName, mimeType: v.mimeType, bytes };
}

/** A multipart form's "file" field as an upload. */
export async function uploadFrom(form: FormData): Promise<Upload> {
  const f = form.get("file");
  if (!(f instanceof File)) throw new SharingRefusal("Attach the file");
  return { fileName: f.name || "file", mimeType: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) };
}
