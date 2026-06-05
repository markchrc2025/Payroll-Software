import { ok, err } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
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

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prismaAdmin.passwordResetToken.findFirst({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return err("This link is invalid or has expired", 400);
  }

  const user = await prismaAdmin.user.findFirst({
    where: { id: record.userId, tenantId: null, deletedAt: null },
    select: { id: true },
  });
  if (!user) return err("This link is invalid or has expired", 400);

  const passwordHash = await bcrypt.hash(password, 10);

  await prismaAdmin.$transaction([
    prismaAdmin.user.update({
      where: { id: user.id },
      data: { passwordHash, isActive: true },
    }),
    prismaAdmin.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return ok({ success: true });
}
