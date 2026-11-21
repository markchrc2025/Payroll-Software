/**
 * PAY-199 (ruling 5, Mark 20 Nov 2026): the employee's e-signature, uploaded
 * in ESS and written on their BIR 2316 PDF. PNG or JPEG (checked by the file's
 * own first bytes, not the name), at most 1 MB.
 */
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export const MAX_SIGNATURE = 1024 * 1024;

export class SignatureRefusal extends Error {
  constructor(message: string, public status: 404 | 422 = 422) { super(message); }
}

export function signatureType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function saveSignature(tx: Tx, tenantId: string, employeeId: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new SignatureRefusal("Attach your signature");
  if (bytes.byteLength > MAX_SIGNATURE) throw new SignatureRefusal("The image is over 1 MB");
  const mimeType = signatureType(bytes);
  if (!mimeType) throw new SignatureRefusal("Use a PNG or JPEG image");
  const data = new Uint8Array(bytes);
  await tx.employeeSignature.upsert({
    where: { employeeId },
    create: { tenantId, employeeId, mimeType, data },
    update: { mimeType, data },
  });
  return { mimeType };
}

export async function signatureOf(tx: Tx, tenantId: string, employeeId: string) {
  const s = await tx.employeeSignature.findFirst({ where: { tenantId, employeeId } });
  return s ? { bytes: new Uint8Array(s.data), mimeType: s.mimeType, updatedAt: s.updatedAt } : null;
}
