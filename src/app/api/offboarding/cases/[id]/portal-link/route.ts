/**
 * PAY-197 part 2, ruling 4: POST /api/offboarding/cases/[id]/portal-link
 * { email? } sends the leaving employee a single-use sign-in link to the
 * offboarding portal, to the personal email on file unless HR gives another
 * (EMPLOYEES:UPDATE).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { sendOffboardingPortalEmail } from "@/lib/email";
import { issuePortalLink, PortalError } from "@/lib/offboarding/portal";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ email: z.string().trim().email().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Give a valid email", 422);
  try {
    const r = await withTenant(auth.tenantId, async (tx) => {
      const c = await tx.offboardingCase.findFirst({ where: { id, tenantId: auth.tenantId }, include: { employee: { select: { firstName: true, personalEmail: true } } } });
      if (!c) throw new PortalError("Offboarding case not found", 404);
      const email = parsed.data.email ?? c.employee.personalEmail;
      if (!email) throw new PortalError("No personal email on file. Give one to send the link to.", 422);
      const token = await issuePortalLink(tx, auth.tenantId, id, email);
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { name: true, tradeName: true } });
      return { token, email, name: c.employee.firstName, company: tenant.tradeName || tenant.name };
    });
    await sendOffboardingPortalEmail({ to: r.email, name: r.name, companyName: r.company, portalUrl: `${APP_URL}/offboard-portal?token=${r.token}` });
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "OffboardingPortalLink", entityId: id, changes: { sentTo: r.email }, ipAddress: getClientIp(req) });
    return ok({ sentTo: r.email });
  } catch (e) {
    if (e instanceof PortalError) return err(e.message, e.status);
    throw e;
  }
}
