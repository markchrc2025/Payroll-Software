/**
 * POST /api/admin/tenants/[id]/users/[userId]
 *
 * Recovery-focused actions a Central Portal admin may take on a TENANT admin
 * user — strictly account recovery, never open-ended editing:
 *   - reset_link : email a password-reset link (no operator-set passwords)
 *   - invite     : re-send the activation/invite link (for users who never logged in)
 *   - activate / deactivate : flip account access
 *
 * Every action is written to the platform audit feed (SECURITY).
 * Requires TENANTS:MANAGE. Uses prismaAdmin (BYPASSRLS).
 */
import { issueUserLink } from "@/lib/user-credential-links";
import type { NextRequest } from "next/server";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { sendTenantAdminResetPassword, sendTenantOnboarding } from "@/lib/emails";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["reset_link", "invite", "activate", "deactivate"]),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Issue the user's one live link of a purpose (unit 0.15 Am 2, ruling B7):
 * "reset_link" is a RESET, "invite" is an INVITE. Neither activates a tenant
 * user; that is the "activate" action.
 */
async function issueLink(userId: string, purpose: "INVITE" | "RESET"): Promise<string> {
  const raw = await issueUserLink(prismaAdmin, { userId, purpose });
  return `${APP_URL}/reset-password?token=${raw}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const ctx = await requireCentralPermission("TENANTS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id, userId } = await params;

  const tenant = await prismaAdmin.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true } });
  if (!tenant) return notFound("Tenant");

  const user = await prismaAdmin.user.findFirst({
    where: { id: userId, tenantId: id, deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
  });
  if (!user) return notFound("User");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Invalid action", 400, parsed.error.flatten());
  const { action } = parsed.data;

  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const audit = (verb: string) =>
    writeCentralAudit({
      actorUserId: ctx.userId,
      action: `${verb} for ${tenant.name}`,
      target: fullName,
      kind: "SECURITY",
      tenantId: tenant.id,
      ipAddress: getClientIp(req),
    });

  try {
    switch (action) {
      case "reset_link": {
        const resetUrl = await issueLink(user.id, "RESET"); // 1h
        await sendTenantAdminResetPassword(user.email, { firstName: user.firstName, resetUrl });
        await audit("sent a password-reset link");
        return ok(null, `Reset link sent to ${user.email}`);
      }
      case "invite": {
        const resetUrl = await issueLink(user.id, "INVITE"); // 7d
        await sendTenantOnboarding(user.email, { firstName: user.firstName, companyName: tenant.name, activationUrl: resetUrl });
        await audit("re-sent the account invite");
        return ok(null, `Invite re-sent to ${user.email}`);
      }
      case "activate": {
        await prismaAdmin.user.update({ where: { id: user.id }, data: { isActive: true } });
        await audit("activated the admin account");
        return ok(null, `${fullName} activated`);
      }
      case "deactivate": {
        await prismaAdmin.user.update({ where: { id: user.id }, data: { isActive: false } });
        await audit("deactivated the admin account");
        return ok(null, `${fullName} deactivated`);
      }
    }
  } catch (e) {
    // Email-send failures land here for reset_link / invite — surface them.
    if (action === "reset_link" || action === "invite") {
      console.error("[tenant user recovery] email failed:", e);
      return err("Could not send the email — check email delivery configuration.", 502);
    }
    return serverError(e);
  }
}
