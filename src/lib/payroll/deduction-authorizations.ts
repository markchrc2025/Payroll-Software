/**
 * PAY-150: the employee's written authorization for an Other Deduction, kept
 * as an uploaded copy. One place for where it is stored and whether a key may
 * be saved for a given company (never another company's file or any other
 * object in storage). Also the checks an assignment's guard fields must pass.
 */
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isR2Configured, putObject, r2, R2_BUCKET } from "@/lib/r2";
import { readUploadedFile } from "@/lib/server-upload";
import { err } from "@/lib/api-response";
import type { TenantTx } from "@/lib/with-tenant";

export const MAX_AUTHORIZATION_SIZE = 10 * 1024 * 1024;
export const ALLOWED_AUTHORIZATION_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export const authorizationPrefix = (tenantId: string) => `tenants/${tenantId}/deduction-authorizations/`;

export function isTenantAuthorizationKey(tenantId: string, key: string): boolean {
  const prefix = authorizationPrefix(tenantId);
  return key.startsWith(prefix) && /^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key.slice(prefix.length));
}

export async function storeAuthorization(req: Request, tenantId: string): Promise<{ key: string } | { error: Response }> {
  if (!isR2Configured()) return { error: err("File storage is not configured on the server. Contact your administrator.", 503) };
  const read = await readUploadedFile(req, { allowedTypes: ALLOWED_AUTHORIZATION_TYPES, maxBytes: MAX_AUTHORIZATION_SIZE, label: "Authorization" });
  if (read.error) return { error: read.error };
  const key = `${authorizationPrefix(tenantId)}${crypto.randomUUID()}.${EXT[read.file.type] ?? "bin"}`;
  try {
    await putObject(key, Buffer.from(await read.file.arrayBuffer()), read.file.type);
  } catch (e) {
    return { error: err(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 502) };
  }
  return { key };
}

export async function authorizationViewUrl(key: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 300 });
}

/**
 * Why these guard fields cannot be saved on this employee's assignment of
 * this component, or null when they can.
 */
export async function guardFieldsProblem(
  tx: TenantTx,
  p: {
    tenantId: string;
    employeeId: string;
    component: { kind: string; isLossOrDamage: boolean };
    authorizationFileKey?: string | null;
    incidentReportId?: string | null;
    actualLossCents?: bigint | null;
  },
): Promise<string | null> {
  const isDeduction = p.component.kind === "DEDUCTION";
  if (!isDeduction && (p.authorizationFileKey || p.incidentReportId || p.actualLossCents != null)) {
    return "Authorization and loss details apply to deductions only.";
  }
  if (p.authorizationFileKey && !isTenantAuthorizationKey(p.tenantId, p.authorizationFileKey)) {
    return "That authorization file was not uploaded for this company.";
  }
  if (!p.component.isLossOrDamage && (p.incidentReportId || p.actualLossCents != null)) {
    return "An incident record and actual loss apply to loss or damage deductions only.";
  }
  if (p.incidentReportId) {
    const inc = await tx.incidentReport.findFirst({
      where: { id: p.incidentReportId, tenantId: p.tenantId, employeeId: p.employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!inc) return "That incident record is not this employee's.";
  }
  if (p.actualLossCents != null && p.actualLossCents <= 0n) return "The actual loss must be more than zero.";
  return null;
}
