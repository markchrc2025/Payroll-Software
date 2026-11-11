/**
 * POST /api/ess/activate: accept an ESS email invitation.
 *
 * Public (token-authenticated). Body: { token, pin }.
 *
 * Unit 0.15 Amendment 1, ruling B7: the invitation is the ONLY way an ESS
 * account becomes ACTIVE. The link works only while the employee is INVITED
 * (an employee HR has since disabled cannot re-activate themselves with an old
 * link), is claimed atomically, and retires any other invitation. Logic in
 * src/lib/ess-credential-links.ts.
 *
 * Amendment 3 (Mark's ruling of 10 Nov): the employee chooses their own 6-digit
 * PIN here. HR never sets or sees it. A PIN the policy refuses (too easy, the
 * birth date, the employee number) is refused before the link is used, so the
 * employee can try again with the same link.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { claimInvite } from "@/lib/ess-credential-links";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "Your PIN must be exactly 6 digits."),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, pin } = parsed.data;

  try {
    const result = await claimInvite(prismaAdmin, token, pin);
    if (!result.ok) {
      if (result.reason === "weak_pin") return err(result.message, 422);
      if (result.reason === "separated") return err("This account is no longer active. Please contact HR.", 403);
      return err("This activation link is invalid or has expired. Ask HR to resend your invite.", 400);
    }
    return ok({ employeeNumber: result.employeeNumber }, "Account activated. Sign in with your employee number and PIN.");
  } catch (e) {
    console.error("[ess/activate]", e);
    return serverError(e);
  }
}
