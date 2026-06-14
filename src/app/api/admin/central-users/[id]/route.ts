import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendPasswordResetEmail } from "@/lib/email";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    // empty string / null clears the title; omit to leave unchanged.
    jobTitle: z.string().trim().max(100).nullable().optional(),
    // null clears the role; a string assigns it. Omit to leave unchanged.
    centralRoleId: z.string().min(1).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("USERS", "MANAGE");
  if (ctx instanceof Response) return ctx;
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

  // Validate role assignment against the live catalog when provided.
  if (parsed.data.centralRoleId) {
    const role = await prismaAdmin.centralRole.findFirst({
      where: { id: parsed.data.centralRoleId, deletedAt: null },
      select: { id: true },
    });
    if (!role) return err("Selected role no longer exists", 422);
  }

  try {
    const updated = await prismaAdmin.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true, email: true, firstName: true, lastName: true, jobTitle: true, isActive: true,
        centralRoleId: true,
        centralRole: { select: { id: true, name: true } },
      },
    });
    return ok(updated);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return err("A user with that email already exists", 409);
    }
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("USERS", "MANAGE");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  if (id === ctx.userId) {
    return err("You cannot delete your own account", 400);
  }

  // Require the caller to confirm with their own password.
  const body = await req.json().catch(() => null);
  if (!body?.password || typeof body.password !== "string") {
    return err("Password confirmation is required", 400);
  }

  const caller = await prismaAdmin.user.findFirst({
    where: { id: ctx.userId },
    select: { passwordHash: true },
  });
  if (!caller?.passwordHash) {
    return err("Cannot verify identity — no password is set on your account", 400);
  }
  const passwordOk = await bcrypt.compare(body.password, caller.passwordHash);
  if (!passwordOk) return err("Incorrect password", 401);

  const target = await prismaAdmin.user.findFirst({
    where: { id, tenantId: null, deletedAt: null },
    select: { id: true },
  });
  if (!target) return err("Central admin not found", 404);

  // Soft-delete (matches the deletedAt convention used across admin tables) and
  // revoke access. Freeing the email for re-invite later.
  await prismaAdmin.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return ok({ id, deleted: true });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("USERS", "MANAGE");
  if (ctx instanceof Response) return ctx;
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

  try {
    await sendPasswordResetEmail({ to: target.email, name: target.firstName, resetUrl: link });
  } catch (e) {
    // The token exists, but delivery failed. Tell the admin the truth instead
    // of a misleading "link sent" toast. (This is an authenticated USERS:MANAGE
    // action, so there's no account-enumeration concern in being specific.)
    console.error("[central-users] password reset email failed:", e);
    return err(
      "Reset link was generated but the email could not be sent. Check the email (Resend) configuration — most likely the sending domain isn't verified.",
      502,
    );
  }

  return ok({ reset: true });
}
