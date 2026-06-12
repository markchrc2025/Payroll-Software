/**
 * PATCH /api/admin/tenants/[id]/users/[userId] — reset a user's password
 *
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import prismaAdmin from "@/lib/prisma-admin";
import { sendPasswordChangedEmail } from "@/lib/email";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { z } from "zod";

const patchSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const ctx = await requireCentralPermission("TENANTS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id, userId } = await params;

  const tenant = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) return notFound("Tenant");

  const user = await prismaAdmin.user.findFirst({
    where: { id: userId, tenantId: id, deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });
  if (!user) return notFound("User");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await prismaAdmin.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Security notice to the affected user. The password IS changed at this
    // point, so a delivery failure must not fail the request — log it instead.
    try {
      await sendPasswordChangedEmail({ to: user.email, name: user.firstName });
    } catch (e) {
      console.error("[admin user password] password-changed email failed:", e);
    }

    return ok(null, "Password updated");
  } catch (e) {
    return serverError(e);
  }
}
