/**
 * Wave F3 (PAY-216): Document and Form Sharing for HR (src/lib/team/sharing.ts).
 *   GET   the shared documents with acknowledgement counts (SETTINGS:READ)
 *   POST  multipart { file, title, description?, requiresAck, departmentIds, branchIds } (SETTINGS:CREATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { audienceEmployees, asAudience } from "@/lib/team/audience";
import { shareDocument, SharingRefusal, uploadFrom } from "@/lib/team/sharing";

const list = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v.split(",").filter(Boolean) : []);

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const rows = await withTenant(auth.tenantId, async (tx) => {
    const docs = await tx.sharedDocument.findMany({ where: { tenantId: auth.tenantId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1, select: { fileName: true, createdAt: true } } }, orderBy: { updatedAt: "desc" } });
    return Promise.all(docs.map(async (d) => {
      const audience = asAudience(d.audience);
      const people = await audienceEmployees(tx, auth.tenantId, audience);
      const acked = d.requiresAck ? await tx.sharedDocumentAck.count({ where: { documentId: d.id, version: d.currentVersion, employeeId: { in: people.map((p) => p.id) } } }) : 0;
      return { id: d.id, title: d.title, description: d.description, audience, requiresAck: d.requiresAck, version: d.currentVersion, fileName: d.versions[0]?.fileName ?? null, updatedAt: d.versions[0]?.createdAt ?? d.updatedAt, audienceCount: people.length, acknowledged: acked };
    }));
  });
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "CREATE"]);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const f = await uploadFrom(form);
    const doc = await withTenant(auth.tenantId, (tx) => shareDocument(tx, auth.tenantId, auth.userId, {
      title: String(form.get("title") ?? ""), description: (form.get("description") as string | null) || null,
      audience: { departmentIds: list(form.get("departmentIds")), branchIds: list(form.get("branchIds")) }, requiresAck: form.get("requiresAck") === "true",
    }, f));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "CREATE", entity: "SharedDocument", entityId: doc.id, ipAddress: getClientIp(req) });
    return ok(doc, "Shared", 201);
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
