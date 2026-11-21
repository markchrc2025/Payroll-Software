/**
 * PAY-197: POST /api/offboarding/items/[id]/clear { remarks? }. Only the
 * item's signatory, never the leaving employee.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { clearItem, OffboardingError } from "@/lib/offboarding/clearance";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: a signatory signs off only items assigned to them; clearItem refuses anyone else and the leaving employee.
  const { id } = await params;
  const parsed = z.object({ remarks: z.string().max(500).nullish() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid remarks", 422);
  try {
    const item = await withTenant(auth.tenantId, (tx) => clearItem(tx, auth.tenantId, auth.userId ?? null, id, parsed.data.remarks));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "APPROVE", entity: "ClearanceItem", entityId: id, changes: { after: { status: "CLEARED", remarks: parsed.data.remarks ?? null } }, ipAddress: getClientIp(req) });
    return ok(item);
  } catch (e) {
    if (e instanceof OffboardingError) return err(e.message, e.status);
    throw e;
  }
}
