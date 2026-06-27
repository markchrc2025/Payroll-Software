/**
 * POST /api/employees/[id]/ess-invite — email an ESS activation link.
 *
 * Grants ESS access (status → INVITED) and emails the employee a one-time link
 * to set their password and activate. Requires a work email on file and a
 * configured email provider (RESEND_API_KEY). Resending invalidates any prior
 * unused invite.
 *
 * Requires EMPLOYEES:UPDATE.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { generateEssToken, hashEssToken } from "@/lib/ess-auth";
import { sendEmployeeOnboarding } from "@/lib/emails";

const EXPIRES_DAYS = 7;
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
      select: { id: true, firstName: true, lastName: true, workEmail: true, employeeNumber: true },
    });
    if (!emp) return null;
    const tenant = await tx.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, companyCode: true },
    });
    return { emp, tenant };
  });

  if (!data) return notFound("Employee");
  const { emp, tenant } = data;

  if (!emp.workEmail) {
    return err("This employee has no work email on file — add one before inviting, or activate manually.", 422);
  }
  if (!tenant?.companyCode) {
    return err("Your company code isn't set — configure it in Settings before sending ESS invites.", 422);
  }

  const rawToken = generateEssToken();
  const tokenHash = hashEssToken(rawToken);
  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await withTenant(ctx.tenantId, async (tx) => {
    // Invalidate any prior unused invites for this employee.
    await tx.essInvite.updateMany({
      where: { employeeId: id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.essInvite.create({
      data: { tenantId: ctx.tenantId, employeeId: id, tokenHash, expiresAt },
    });
    await tx.employee.update({
      where: { id },
      data: {
        // Grant access; first login (or activation) flips to ACTIVE.
        essAccessStatus: "INVITED",
        essInvitedAt: new Date(),
        essInvitedByUserId: ctx.userId,
        // Re-inviting clears any prior disable / scheduled deactivation.
        essDeactivateAt: null,
        essDeactivateReason: null,
        essDeactivateScheduledByUserId: null,
      },
    });
  });

  // Send the email last — if it fails, surface it (the invite row still exists
  // so a resend works, and access is already granted).
  try {
    await sendEmployeeOnboarding(emp.workEmail, {
      firstName: emp.firstName,
      companyName: tenant.name,
      activationUrl: `${APP_URL}/ess/activate?token=${rawToken}`,
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
    changes: { field: "essAccess", essAction: "invite", to: emp.workEmail },
    ipAddress: getClientIp(req),
  });

  return ok({ id, invitedEmail: emp.workEmail }, "Invitation sent");
}
