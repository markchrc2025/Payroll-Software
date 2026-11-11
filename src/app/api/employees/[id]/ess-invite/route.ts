/**
 * POST /api/employees/[id]/ess-invite — email an ESS activation link.
 *
 * Grants ESS access (status → INVITED) and emails the employee a one-time link
 * where they choose their own 6-digit PIN and activate. Resending invalidates
 * any prior unused invite.
 *
 * Unit 0.15 Amendment 3 (Mark's ruling of 10 Nov): the link goes to the email
 * the record chooses for ESS links, the personal email at hiring, switchable
 * to the work email later (ess-access action set_link_email). Requires that
 * email on file and a configured email provider (RESEND_API_KEY).
 *
 * Requires EMPLOYEES:UPDATE.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { essLinkEmail, issueInvite } from "@/lib/ess-credential-links";
import { sendEmployeeOnboarding } from "@/lib/emails";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  // Load employee + tenant (for company code / name shown in the email).
  const data = await withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        essEmailChoice: true,
        personalEmail: true,
        workEmail: true,
      },
    });
    if (!emp) return null;
    const tenant = await tx.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, companyCode: true, contactEmail: true },
    });
    return { emp, tenant };
  });

  if (!data) return notFound("Employee");
  const { emp, tenant } = data;

  const to = essLinkEmail(emp);
  if (!to) {
    return err(
      emp.essEmailChoice === "WORK"
        ? "ESS links for this employee go to their work email, and none is on file. Add one, or switch ESS links back to the personal email."
        : "This employee has no personal email on file. Add one before inviting, or switch ESS links to the work email.",
      422,
    );
  }
  if (!tenant?.companyCode) {
    return err("Your company code isn't set — configure it in Settings before sending ESS invites.", 422);
  }

  // Unit 0.15 Amendment 1, ruling B7: the invitation engine issues the
  // employee's ONE live invitation and retires every earlier unused one, so
  // only the newest email works.
  const rawToken = await withTenant(ctx.tenantId, async (tx) => {
    const { rawToken } = await issueInvite(tx, { tenantId: ctx.tenantId, employeeId: id });
    await tx.employee.update({
      where: { id },
      data: {
        // Grant access; only accepting this invitation flips it to ACTIVE.
        essAccessStatus: "INVITED",
        essInvitedAt: new Date(),
        essInvitedByUserId: ctx.userId,
        // Re-inviting clears any prior disable / scheduled deactivation.
        essDeactivateAt: null,
        essDeactivateReason: null,
        essDeactivateScheduledByUserId: null,
      },
    });
    return rawToken;
  });

  // Send the email last — if it fails, surface it (the invite row still exists
  // so a resend works, and access is already granted).
  try {
    await sendEmployeeOnboarding(to, {
      firstName: emp.firstName,
      companyName: tenant.name,
      activationUrl: `${APP_URL}/ess/activate?token=${rawToken}`,
      // Employees contact their own company/HR for sign-in trouble, not Sentire.
      supportEmail: tenant.contactEmail ?? undefined,
    });
  } catch (e) {
    console.error("[ess-invite] email failed:", e);
    return err(
      "Access was granted, but the invitation email couldn't be sent. " +
        "Check the email provider configuration, then use Resend.",
      502,
    );
  }

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    changes: { field: "essAccess", essAction: "invite", to, linkEmail: emp.essEmailChoice },
    ipAddress: getClientIp(req),
  });

  return ok({ id, invitedEmail: to, linkEmail: emp.essEmailChoice }, "Invitation sent");
}
