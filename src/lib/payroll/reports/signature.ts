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

/**
 * Mark's ruling (22 Nov 2026 00:30): the HR manager the employer assigns to
 * sign BIR 2316 (Items 53 and 55) and that person's e-signature. The person
 * is a user of the company; their name is printed with the position.
 */
export async function saveSignatory(
  tx: Tx, tenantId: string, actorUserId: string | null,
  input: { userId: string; position: string; signature?: Uint8Array | null },
) {
  const position = input.position.trim();
  if (position.length < 2) throw new SignatureRefusal("Enter the signatory's position");
  const user = await tx.user.findFirst({ where: { id: input.userId, tenantId, isActive: true }, select: { id: true } });
  if (!user) throw new SignatureRefusal("Choose an active user of this company", 422);
  let image: { mimeType: string; data: Uint8Array<ArrayBuffer> } | null = null;
  if (input.signature) {
    if (input.signature.byteLength > MAX_SIGNATURE) throw new SignatureRefusal("The image is over 1 MB");
    const mimeType = signatureType(input.signature);
    if (!mimeType) throw new SignatureRefusal("Use a PNG or JPEG image");
    image = { mimeType, data: new Uint8Array(input.signature) };
  }
  const existing = await tx.bir2316Signatory.findUnique({ where: { tenantId } });
  // A new person keeps no one else's signature.
  const keep = existing && existing.userId === user.id && !image;
  const sigData = image ?? (keep ? null : { mimeType: null, data: null });
  return tx.bir2316Signatory.upsert({
    where: { tenantId },
    create: { tenantId, userId: user.id, position, updatedByUserId: actorUserId, ...(image ?? {}) },
    update: { userId: user.id, position, updatedByUserId: actorUserId, ...(sigData ?? {}) },
  });
}

export async function signatoryOf(tx: Tx, tenantId: string) {
  const s = await tx.bir2316Signatory.findUnique({
    where: { tenantId },
    include: { user: { select: { firstName: true, lastName: true, isActive: true } } },
  });
  if (!s || !s.user.isActive) return null;
  return {
    userId: s.userId,
    name: `${s.user.firstName} ${s.user.lastName}`.trim(),
    position: s.position,
    signature: s.data && s.mimeType ? { bytes: new Uint8Array(s.data), mimeType: s.mimeType } : null,
    updatedAt: s.updatedAt,
  };
}
