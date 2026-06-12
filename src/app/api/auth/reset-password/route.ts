/**
 * POST /api/auth/reset-password
 *
 * Accepts { token, password } and updates the user's passwordHash.
 * Token is validated against the SHA-256 hash stored in PasswordResetToken.
 */

import { type NextRequest } from "next/server";
import { createHash } from "crypto";
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
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const record = await prismaAdmin.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
    return err("This reset link is invalid or has expired.", 400);
  }

  const user = await prismaAdmin.user.findUnique({
    where: { id: record.userId },
    select: { id: true, isActive: true, deletedAt: true, email: true, firstName: true },
  });

  if (!user || !user.isActive || user.deletedAt !== null) {
    return err("This reset link is invalid or has expired.", 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prismaAdmin.$transaction([
    prismaAdmin.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prismaAdmin.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Security notice. The password IS changed at this point, so a delivery
  // failure must not fail the request (the user would retry with a now-used
  // token) — log it instead.
  try {
    await sendPasswordChangedEmail({ to: user.email, name: user.firstName });
  } catch (e) {
    console.error("[reset-password] password-changed email failed:", e);
  }

  return ok(null, "Password updated successfully.");
}
