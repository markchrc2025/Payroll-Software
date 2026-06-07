import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendPasswordResetEmail } from "@/lib/email";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
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
        id: true, email: true, firstName: true, lastName: true, isActive: true,
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("USERS", "MANAGE");
  if (ctx instanceof Response) return ctx;
  const { id } = await params;

  if (id === ctx.userId) {
    return err("You cannot delete your own account", 400);
  }

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
  await sendPasswordResetEmail({ to: target.email, name: target.firstName, resetUrl: link }).catch(() => {});

  return ok({ reset: true });
}
