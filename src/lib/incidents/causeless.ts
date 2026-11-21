/**
 * PAY-217 Causeless (Mark, 21 Nov 2026 22:25: "a note and an attachment would
 * suffice"). A record on an employee that carries no cause, no Code of Conduct
 * category, no decision and nothing for payroll: a dated note and, if HR has
 * one, a file (a memo, a photo, a signed acknowledgement).
 *
 * The file goes to object storage when it is configured, else into the
 * database (at most 10 MB), as shared documents do.
 */
import type { Prisma } from "@prisma/client";
import { isR2Configured, putObject, r2, R2_BUCKET } from "@/lib/r2";

type Tx = Prisma.TransactionClient;
export const MAX_CAUSELESS_FILE = 10 * 1024 * 1024;

export class CauselessRefusal extends Error {
  constructor(message: string, public status: 404 | 422 = 422) { super(message); }
}

export type Upload = { fileName: string; mimeType: string; bytes: Uint8Array };

export async function addNote(tx: Tx, tenantId: string, userId: string | null, input: { employeeId: string; noteDate: string; note: string }, file: Upload | null) {
  const note = input.note.trim();
  if (note.length < 3) throw new CauselessRefusal("Write the note");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.noteDate)) throw new CauselessRefusal("Enter the date");
  const emp = await tx.employee.findFirst({ where: { id: input.employeeId, tenantId, deletedAt: null }, select: { id: true } });
  if (!emp) throw new CauselessRefusal("Employee not found", 404);
  if (file && file.bytes.byteLength === 0) throw new CauselessRefusal("The file is empty");
  if (file && file.bytes.byteLength > MAX_CAUSELESS_FILE) throw new CauselessRefusal("The file is over 10 MB");
  const row = await tx.causelessNote.create({
    data: {
      tenantId, employeeId: emp.id, noteDate: new Date(`${input.noteDate}T00:00:00.000Z`), note, createdByUserId: userId,
      ...(file ? { fileName: file.fileName, mimeType: file.mimeType, fileSize: file.bytes.byteLength } : {}),
    },
  });
  if (file) {
    if (isR2Configured()) {
      const key = `tenants/${tenantId}/causeless/${row.id}/${file.fileName.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
      await putObject(key, file.bytes, file.mimeType);
      await tx.causelessNote.update({ where: { id: row.id }, data: { storageKey: key } });
    } else {
      await tx.causelessNote.update({ where: { id: row.id }, data: { data: new Uint8Array(file.bytes) } });
    }
  }
  return row;
}

export async function listNotes(tx: Tx, tenantId: string, employeeId?: string | null) {
  const rows = await tx.causelessNote.findMany({
    where: { tenantId, deletedAt: null, ...(employeeId ? { employeeId } : {}) },
    select: { id: true, employeeId: true, noteDate: true, note: true, fileName: true, fileSize: true, createdAt: true, employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
    orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id, employeeId: r.employeeId, name: `${r.employee.lastName}, ${r.employee.firstName}`, employeeNumber: r.employee.employeeNumber,
    noteDate: r.noteDate.toISOString().slice(0, 10), note: r.note, fileName: r.fileName, fileSize: r.fileSize, createdAt: r.createdAt.toISOString(),
  }));
}

export async function noteFile(tx: Tx, tenantId: string, id: string) {
  const r = await tx.causelessNote.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!r || !r.fileName) throw new CauselessRefusal("No file on this note", 404);
  let bytes: Uint8Array;
  if (r.data) bytes = new Uint8Array(r.data);
  else {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: r.storageKey! }));
    bytes = new Uint8Array(await out.Body!.transformToByteArray());
  }
  return { fileName: r.fileName, mimeType: r.mimeType ?? "application/octet-stream", bytes };
}

export async function removeNote(tx: Tx, tenantId: string, id: string) {
  const r = await tx.causelessNote.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
  if (!r) throw new CauselessRefusal("Note not found", 404);
  await tx.causelessNote.update({ where: { id }, data: { deletedAt: new Date() } });
}
