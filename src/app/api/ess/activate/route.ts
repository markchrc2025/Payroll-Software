/**
 * POST /api/ess/activate: accept an ESS email invitation.
 *
 * Public (token-authenticated). Body: { token, password }.
 *
 * Unit 0.15 Amendment 1, ruling B7: the invitation is the ONLY way an ESS
 * account becomes ACTIVE. The link works only while the employee is INVITED
 * (an employee HR has since disabled cannot re-activate themselves with an old
 * link), is claimed atomically, and retires any other invitation. Logic in
 * src/lib/ess-credential-links.ts.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { hashEssPassword } from "@/lib/ess-auth";
import { claimInvite } from "@/lib/ess-credential-links";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, password } = parsed.data;

  try {
    const passwordHash = await hashEssPassword(password);
    const result = await claimInvite(prismaAdmin, token, passwordHash);
    if (!result.ok) {
      if (result.reason === "separated") return err("This account is no longer active. Please contact HR.", 403);
      return err("This activation link is invalid or has expired. Ask HR to resend your invite.", 400);
    }
    return ok({ employeeNumber: result.employeeNumber }, "Account activated. You can now sign in.");
  } catch (e) {
    console.error("[ess/activate]", e);
    return serverError(e);
  }
}
