/**
 * PAY-197: one offboarding case (EMPLOYEES:READ); PATCH { status: "CLOSED" }
 * closes a cleared case (EMPLOYEES:UPDATE).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { caseView } from "@/lib/offboarding/views";

const include = {
  employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
  items: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], include: { signatory: { select: { id: true, firstName: true, lastName: true } } } },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  const c = await withTenant(auth.tenantId, (tx) => tx.offboardingCase.findFirst({ where: { id, tenantId: auth.tenantId }, include }));
  if (!c) return err("Offboarding case not found", 404);
  return ok(caseView(c));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ status: z.literal("CLOSED") }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Only closing a case is allowed here", 422);
  const r = await withTenant(auth.tenantId, async (tx) => {
    const c = await tx.offboardingCase.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!c) return "missing" as const;
    if (c.status === "OPEN") return "open" as const;
    return tx.offboardingCase.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() }, include });
  });
  if (r === "missing") return err("Offboarding case not found", 404);
  if (r === "open") return err("Clearance is not complete; the case cannot be closed yet.", 409);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "OffboardingCase", entityId: id, changes: { after: { status: "CLOSED" } }, ipAddress: getClientIp(req) });
  return ok(caseView(r));
}
