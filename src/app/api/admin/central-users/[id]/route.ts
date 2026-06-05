import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendPasswordResetEmail } from "@/lib/email";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

const patchSchema = z.object({ isActive: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid payload", 422);

  if (id === ctx.userId && parsed.data.isActive === false) {
    return err("You cannot deactivate your own account", 400);
  }

  const target = await prismaAdmin.user.findFirst({
    where: { id, tenantId: null, deletedAt: null },
    select: { id: true },
  });
  if (!target) return err("Central admin not found", 404);

  const updated = await prismaAdmin.user.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, isActive: true },
  });
  return ok(updated);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const target = await prismaAdmin.user.findFirst({
    where: { id, tenantId: null, deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });
  if (!target) return err("Central admin not found", 404);

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  await prismaAdmin.passwordResetToken.create({
    data: { userId: target.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://sentire-payroll.onrender.com";
  const link = `${base}/centralportal/reset-password?token=${raw}`;
  await sendPasswordResetEmail({ to: target.email, name: target.firstName, resetUrl: link }).catch(() => {});

  return ok({ reset: true });
}
