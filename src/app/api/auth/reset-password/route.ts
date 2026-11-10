/**
 * POST /api/auth/reset-password
 *
 * Accepts { token, password } and updates the user's passwordHash.
 * Token is validated against the SHA-256 hash stored in PasswordResetToken.
 */

import { type NextRequest } from "next/server";
import { claimUserLink } from "@/lib/user-credential-links";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { sendPasswordChangedEmail } from "@/lib/email";
import { ok, err } from "@/lib/api-response";

const schema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid input", 422);
  }

  const { token, password } = parsed.data;
  // Unit 0.15 Am 2 (rulings B7, B8): the link is claimed atomically, a RESET
  // never activates an account, and every running session of the user ends.
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await claimUserLink(prismaAdmin, token, passwordHash, { scope: "any" });
  if (!result.ok) return err("This reset link is invalid or has expired.", 400);
  const user = { email: result.email, firstName: result.firstName };

  // Security notice. The password IS changed at this point, so a delivery
  // failure must not fail the request (the user would retry with a now-used
  // token) — log it instead.
  try {
    await sendPasswordChangedEmail({ to: user.email, name: user.firstName });
  } catch (e) {
    console.error("[reset-password] password-changed email failed:", e);
  }

  return ok(null, "Password updated. You have been signed out everywhere; sign in with your new password.");
}
