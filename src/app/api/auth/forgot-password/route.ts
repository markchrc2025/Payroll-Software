/**
 * POST /api/auth/forgot-password
 *
 * Accepts { email } and sends a password-reset link if the address is found.
 * Always returns 200 to prevent user enumeration.
 */

import { type NextRequest } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { sendTenantAdminResetPassword } from "@/lib/emails";
import { ok, err } from "@/lib/api-response";

const schema = z.object({
  email: z.string().email(),
});

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err("Invalid email address", 422);
  }

  const { email } = parsed.data;

  // Always respond 200 — never reveal whether the email exists
  try {
    const user = await prismaAdmin.user.findFirst({
      where: { email, isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (user) {
      // Invalidate any existing unused tokens
      await prismaAdmin.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Generate a new token
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await prismaAdmin.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      await sendTenantAdminResetPassword(user.email, {
        firstName: user.firstName,
        resetUrl,
      });
    }
  } catch (e) {
    console.error("[forgot-password]", e);
    // Still return 200 — don't leak errors to the client
  }

  return ok(null, "If that email is registered, a reset link has been sent.");
}
