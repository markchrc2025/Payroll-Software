import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendWelcomeEmail } from "@/lib/email";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

export async function GET() {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const admins = await prismaAdmin.user.findMany({
    where: { tenantId: null, deletedAt: null },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return ok({ admins });
}

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export async function POST(req: Request) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();
  void forbidden;

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return err("Invalid invite payload", 422);
  const { email, firstName, lastName } = parsed.data;

  const existing = await prismaAdmin.user.findFirst({ where: { email } });
  if (existing) return err("A user with that email already exists", 409);

  const user = await prismaAdmin.user.create({
    data: {
      email, firstName, lastName,
      tenantId: null,
      systemRole: "SUPER_ADMIN",
      isActive: false,
      passwordHash: "",
    },
    select: { id: true, email: true, firstName: true },
  });

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  await prismaAdmin.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://sentire-payroll.onrender.com";
  const link = `${base}/centralportal/accept-invite?token=${raw}`;
  await sendWelcomeEmail({ to: user.email, name: user.firstName, loginUrl: link }).catch(() => {});

  return ok({ id: user.id, invited: true });
}
