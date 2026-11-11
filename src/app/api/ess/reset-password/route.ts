/**
 * POST /api/ess/reset-password: complete an ESS reset (Forgot PIN).
 *
 * Public (token-authenticated). Body: { token, pin }.
 *
 * Unit 0.15 Amendment 1, rulings B7 and B8: a reset changes the password of an
 * account that is ALREADY ACTIVE, and nothing else. It never activates an
 * invited account (only the invitation does that), it claims its link
 * atomically, it ends every open ESS session, and it retires the employee's
 * other reset links. The logic lives in src/lib/ess-credential-links.ts so the
 * reset and invitation engines cannot drift into each other again.
 *
 * Amendment 3 (Mark's ruling of 10 Nov): the reset sets a new 6-digit PIN,
 * removes the optional password (the employee can set a new one after signing
 * in), and lifts a wrong-attempt lock at once.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { claimReset } from "@/lib/ess-credential-links";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const schema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "Your PIN must be exactly 6 digits."),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, pin } = parsed.data;

  try {
    const result = await claimReset(prismaAdmin, token, pin);

    if (!result.ok) {
      if (result.reason === "weak_pin") return err(result.message, 422);
      if (result.reason === "separated") return err("This account is no longer active. Please contact HR.", 403);
      if (result.reason === "not_active") {
        return err("This account has not been activated. Use the invitation email from HR, or ask HR to resend it.", 403);
      }
      return err(INVALID, 400);
    }

    if (result.email) {
      try {
        const { device, changedAt } = securityContext(req);
        await sendEmployeeResetPasswordNotice(result.email, {
          accountEmail: result.email,
          changedAt,
          device,
          secureUrl: `${APP_URL}/ess/login`,
        });
      } catch (e) {
        console.error("[ess/reset-password] notice email failed:", e);
      }
    }

    return ok({ success: true }, "PIN updated. Every device was signed out; sign in with your new PIN.");
  } catch (e) {
    console.error("[ess/reset-password]", e);
    return serverError(e);
  }
}
