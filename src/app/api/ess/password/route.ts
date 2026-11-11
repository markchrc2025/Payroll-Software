/**
 * POST /api/ess/password
 *
 * Lets a signed-in employee set or change their ESS password. Requires a valid
 * ESS session; the password is bcrypt-hashed into Employee.essPasswordHash.
 *
 * Body: { newPassword: string (min 8), currentPassword?: string }
 *
 * Unit 0.15 Amendment 1, ruling B8: changing the password ENDS EVERY ESS
 * SESSION of the employee, including the one making the request; the client
 * signs out and the employee signs in again with the new password. If the
 * account already has a password, the current one is required, so a stolen
 * session alone cannot lock the owner out.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError, unauthorized } from "@/lib/api-response";
import { getEssContext, hashEssPassword, verifyEssPassword } from "@/lib/ess-auth";
import { endAllEssSessions } from "@/lib/ess-credential-links";
import { withTenant } from "@/lib/with-tenant";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const Schema = z.object({
  newPassword: z.string().min(8).max(72),
  currentPassword: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return err("Password must be at least 8 characters", 400, parsed.error.flatten());
  }

  try {
    const hash = await hashEssPassword(parsed.data.newPassword);
    const emp = await withTenant(ctx.tenantId, async (tx) => {
      const current = await tx.employee.findFirst({
        where: { id: ctx.employeeId, tenantId: ctx.tenantId },
        select: { essPasswordHash: true },
      });
      if (current?.essPasswordHash) {
        const given = parsed.data.currentPassword ?? "";
        if (!given || !(await verifyEssPassword(given, current.essPasswordHash))) return "wrong_current" as const;
      }
      const updated = await tx.employee.update({
        where: { id: ctx.employeeId },
        data: { essPasswordHash: hash },
        select: { workEmail: true },
      });
      await endAllEssSessions(tx, ctx.employeeId);
      return updated;
    });
    if (emp === "wrong_current") return err("Your current password is incorrect.", 400);

    // Security notice (best-effort — never fail the change on a delivery error).
    if (emp.workEmail) {
      try {
        const { device, changedAt } = securityContext(req);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await sendEmployeeResetPasswordNotice(emp.workEmail, {
          accountEmail: emp.workEmail,
          changedAt,
          device,
          secureUrl: `${appUrl}/ess/login`,
        });
      } catch (mailErr) {
        console.error("[ess/password] notice email failed:", mailErr);
      }
    }

    return ok({ updated: true, signedOut: true }, "Password updated. You have been signed out everywhere; sign in with your new password.");
  } catch (e) {
    console.error("[ess/password]", e);
    return serverError(e);
  }
}
