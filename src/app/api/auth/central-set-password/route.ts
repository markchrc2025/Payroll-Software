import { ok, err } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendAdminResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";
import bcrypt from "bcryptjs";
import { claimUserLink } from "@/lib/user-credential-links";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid payload", 422);
  }
  const { token, password } = parsed.data;

  // Unit 0.15 Am 2 (rulings B7, B8). Before: ANY token set `isActive: true`,
  // so a reset link sent to a deactivated Central admin switched them back on.
  // Now only an INVITE activates, and only a never-activated account; a RESET
  // needs an account that is already active. Sessions end either way.
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await claimUserLink(prismaAdmin, token, passwordHash, { scope: "central" });
  if (!result.ok) return err("This link is invalid or has expired", 400);
  const user = await prismaAdmin.user.findFirst({
    where: { id: result.userId },
    select: { email: true, systemRole: true, centralRole: { select: { name: true } } },
  });
  if (!user) return err("This link is invalid or has expired", 400);

  // Security notice. The password IS changed at this point, so a delivery
  // failure must not fail the request (the user would retry with a now-used
  // token) — log it instead.
  try {
    const { device, changedAt } = securityContext(req);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sentire-payroll.onrender.com";
    await sendAdminResetPasswordNotice(user.email, {
      accountEmail: user.email,
      role: user.centralRole?.name ?? user.systemRole ?? "Central Admin",
      changedAt,
      device,
      secureUrl: `${appUrl}/centralportal`,
    });
  } catch (e) {
    console.error("[central-set-password] password-changed email failed:", e);
  }

  return ok({ success: true });
}
