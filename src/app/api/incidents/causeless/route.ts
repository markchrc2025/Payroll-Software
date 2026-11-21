/**
 * PAY-217 Causeless notes (src/lib/incidents/causeless.ts).
 *   GET   ?employeeId= the notes (INCIDENTS:READ)
 *   POST  multipart { employeeId, noteDate, note, file? } (INCIDENTS:CREATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { addNote, CauselessRefusal, listNotes } from "@/lib/incidents/causeless";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["INCIDENTS", "READ"]);
  if (denied) return denied;
  const employeeId = new URL(req.url).searchParams.get("employeeId");
  return ok(await withTenant(auth.tenantId, (tx) => listNotes(tx, auth.tenantId, employeeId)));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["INCIDENTS", "CREATE"]);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const f = form.get("file");
    const file = f instanceof File && f.size > 0 ? { fileName: f.name || "file", mimeType: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) } : null;
    const row = await withTenant(auth.tenantId, (tx) => addNote(tx, auth.tenantId, auth.userId ?? null, {
      employeeId: String(form.get("employeeId") ?? ""), noteDate: String(form.get("noteDate") ?? ""), note: String(form.get("note") ?? ""),
    }, file));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "CREATE", entity: "CauselessNote", entityId: row.id, ipAddress: getClientIp(req) });
    return ok({ id: row.id }, "Saved", 201);
  } catch (e) {
    if (e instanceof CauselessRefusal) return err(e.message, e.status);
    throw e;
  }
}
