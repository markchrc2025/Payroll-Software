/**
 * POST /api/ess/password
 *
 * Lets a signed-in employee set or change their optional ESS password. The PIN
 * stays the default sign-in; the password is a second way in that the employee
 * chooses after first sign-in (unit 0.15 Amendment 3, Mark's ruling of
 * 10 Nov 2026).
 *
 * Body: { newPassword: string (8 to 72), current: string }
 *   `current` is the employee's current PIN, or their current password if they
 *   have one. A stolen session alone cannot add or change a password. Wrong
 *   answers count toward the 5-attempt lock (src/lib/ess-current-credential.ts).
 *
 * Ruling B8: setting or changing the password ENDS EVERY ESS SESSION of the
 * employee, including the one making the request; the client signs out and
 * the employee signs in again.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError, unauthorized } from "@/lib/api-response";
import { getEssContext, hashEssPassword } from "@/lib/ess-auth";
import { endAllEssSessions, essLinkEmail } from "@/lib/ess-credential-links";
import { checkCurrentEssCredential } from "@/lib/ess-current-credential";
import { withTenant } from "@/lib/with-tenant";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const Schema = z.object({
  newPassword: z.string().min(8).max(72),
  current: z.string().min(1, "Enter your current PIN or password").max(200),
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
    return err("Enter your current PIN or password, and a new password of at least 8 characters.", 400, parsed.error.flatten());
  }

  try {
    const hash = await hashEssPassword(parsed.data.newPassword);
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const check = await checkCurrentEssCredential(tx, ctx.employeeId, parsed.data.current);
      if (!check.ok) return check;
      const updated = await tx.employee.update({
        where: { id: ctx.employeeId },
        data: { essPasswordHash: hash },
        select: { essEmailChoice: true, personalEmail: true, workEmail: true },
      });
      await endAllEssSessions(tx, ctx.employeeId);
      return { ok: true as const, email: essLinkEmail(updated) };
    });
    if (!result.ok) return err(result.message, result.status);

    // Security notice (best-effort — never fail the change on a delivery error).
    if (result.email) {
      try {
        const { device, changedAt } = securityContext(req);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await sendEmployeeResetPasswordNotice(result.email, {
          accountEmail: result.email,
          changedAt,
          device,
          secureUrl: `${appUrl}/ess/login`,
        });
      } catch (mailErr) {
        console.error("[ess/password] notice email failed:", mailErr);
      }
    }

    return ok({ updated: true, signedOut: true }, "Password saved. You have been signed out everywhere; sign in again.");
  } catch (e) {
    console.error("[ess/password]", e);
    return serverError(e);
  }
}
