/**
 * POST /api/ess/pin: a signed-in employee changes their own 6-digit ESS PIN.
 *
 * Unit 0.15 Amendment 3 (Mark's ruling of 10 Nov 2026): the PIN is the default
 * ESS sign-in and belongs to the employee alone. HR cannot set it.
 *
 * Body: { current: string, newPin: string }
 *   `current` is the current PIN, or the current password if the employee has
 *   one. Wrong answers count toward the 5-attempt lock. The new PIN must pass
 *   the PIN policy (src/lib/ess-pin-policy.ts).
 *
 * Ruling B8: a PIN change ENDS EVERY ESS SESSION, the requesting one included.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError, unauthorized } from "@/lib/api-response";
import { getEssContext, hashEssPin } from "@/lib/ess-auth";
import { endAllEssSessions, essLinkEmail } from "@/lib/ess-credential-links";
import { checkCurrentEssCredential } from "@/lib/ess-current-credential";
import { pinProblem } from "@/lib/ess-pin-policy";
import { withTenant } from "@/lib/with-tenant";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const Schema = z.object({
  current: z.string().min(1, "Enter your current PIN or password").max(200),
  newPin: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err("Enter your current PIN or password, and a new PIN.", 400, parsed.error.flatten());
  const { current, newPin } = parsed.data;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const me = await tx.employee.findFirst({
        where: { id: ctx.employeeId },
        select: { birthDate: true, employeeNumber: true },
      });
      const problem = pinProblem(newPin, { birthDate: me?.birthDate, employeeNumber: me?.employeeNumber });
      if (problem) return { ok: false as const, status: 422 as const, message: problem };

      const check = await checkCurrentEssCredential(tx, ctx.employeeId, current);
      if (!check.ok) return check;

      const updated = await tx.employee.update({
        where: { id: ctx.employeeId },
        data: { essPin: await hashEssPin(newPin) },
        select: { essEmailChoice: true, personalEmail: true, workEmail: true },
      });
      await endAllEssSessions(tx, ctx.employeeId);
      return { ok: true as const, email: essLinkEmail(updated) };
    });
    if (!result.ok) return err(result.message, result.status);

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
        console.error("[ess/pin] notice email failed:", mailErr);
      }
    }

    return ok({ updated: true, signedOut: true }, "PIN changed. You have been signed out everywhere; sign in with your new PIN.");
  } catch (e) {
    console.error("[ess/pin]", e);
    return serverError(e);
  }
}
