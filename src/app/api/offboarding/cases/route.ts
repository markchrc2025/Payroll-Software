/**
 * PAY-197: offboarding cases.
 *   GET  ?status=OPEN|CLEARED|CLOSED  the board (EMPLOYEES:READ)
 *   POST { employeeId, separationReason, lastWorkingDay, notes? } opens a case with the checklist (EMPLOYEES:UPDATE).
 *        Offboarding an employee opens one too.
 */
import { SeparationReason } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { openCase } from "@/lib/offboarding/clearance";
import { caseView } from "@/lib/offboarding/views";

const caseInclude = {
  employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
  items: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], include: { signatory: { select: { id: true, firstName: true, lastName: true } } } },
};


export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await withTenant(auth.tenantId, (tx) => tx.offboardingCase.findMany({
    where: { tenantId: auth.tenantId, ...(status && ["OPEN", "CLEARED", "CLOSED"].includes(status) ? { status: status as "OPEN" } : {}) },
    include: caseInclude, orderBy: { lastWorkingDay: "desc" }, take: 500,
  }));
  return ok(rows.map(caseView));
}

const openSchema = z.object({
  employeeId: z.string().min(1), separationReason: z.nativeEnum(SeparationReason), lastWorkingDay: z.coerce.date(), notes: z.string().max(500).nullish(),
});

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const parsed = openSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid case", 422);
  const c = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({ where: { id: parsed.data.employeeId, tenantId: auth.tenantId, deletedAt: null }, select: { id: true } });
    if (!emp) return null;
    const opened = await openCase(tx, auth.tenantId, { ...parsed.data, createdByUserId: auth.userId ?? null });
    return tx.offboardingCase.findUniqueOrThrow({ where: { id: opened.id }, include: caseInclude });
  });
  if (!c) return err("Employee not found", 404);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "OffboardingCase", entityId: c.id, changes: { after: { employeeId: c.employeeId, items: c.items.length } }, ipAddress: getClientIp(req) });
  return ok(caseView(c), undefined, 201);
}
