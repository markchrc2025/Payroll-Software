/**
 * POST /api/ess/reset-password: complete an ESS password reset.
 *
 * Public (token-authenticated). Body: { token, password }.
 *
 * Unit 0.15 Amendment 1, rulings B7 and B8: a reset changes the password of an
 * account that is ALREADY ACTIVE, and nothing else. It never activates an
 * invited account (only the invitation does that), it claims its link
 * atomically, it ends every open ESS session, and it retires the employee's
 * other reset links. The logic lives in src/lib/ess-credential-links.ts so the
 * reset and invitation engines cannot drift into each other again.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { hashEssPassword } from "@/lib/ess-auth";
import { claimReset } from "@/lib/ess-credential-links";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, password } = parsed.data;

  try {
    const passwordHash = await hashEssPassword(password);
    const result = await claimReset(prismaAdmin, token, passwordHash);

    if (!result.ok) {
      if (result.reason === "separated") return err("This account is no longer active. Please contact HR.", 403);
      if (result.reason === "not_active") {
        return err("This account has not been activated. Use the invitation email from HR, or ask HR to resend it.", 403);
      }
      return err(INVALID, 400);
    }

    if (result.workEmail) {
      try {
        const { device, changedAt } = securityContext(req);
        await sendEmployeeResetPasswordNotice(result.workEmail, {
          accountEmail: result.workEmail,
          changedAt,
          device,
          secureUrl: `${APP_URL}/ess/login`,
        });
      } catch (e) {
        console.error("[ess/reset-password] notice email failed:", e);
      }
    }

    return ok({ success: true }, "Password updated. Every device was signed out; sign in with your new password.");
  } catch (e) {
    console.error("[ess/reset-password]", e);
    return serverError(e);
  }
}
