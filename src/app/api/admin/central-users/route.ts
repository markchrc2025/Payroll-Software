import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { sendWelcomeEmail } from "@/lib/email";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

export async function GET() {
  const ctx = await requireCentralPermission("USERS", "READ");
  if (ctx instanceof Response) return ctx;

  const admins = await prismaAdmin.user.findMany({
    where: { tenantId: null, deletedAt: null },
    select: {
      id: true, email: true, firstName: true, lastName: true, jobTitle: true,
      systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
      centralRoleId: true,
      centralRole: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return ok({ admins });
}

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  jobTitle: z.string().trim().max(100).optional(),
  // A role is required on invite so we never create a powerless ("No role")
  // administrator that can sign in but see nothing.
  centralRoleId: z.string().min(1, "A role is required"),
});

export async function POST(req: Request) {
  const ctx = await requireCentralPermission("USERS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return err("Invalid invite payload", 422);
  const { email, firstName, lastName, jobTitle, centralRoleId } = parsed.data;

  const existing = await prismaAdmin.user.findFirst({ where: { email } });
  if (existing) return err("A user with that email already exists", 409);

  // Ensure the chosen role is a live central role.
  const role = await prismaAdmin.centralRole.findFirst({
    where: { id: centralRoleId, deletedAt: null },
    select: { id: true },
  });
  if (!role) return err("Selected role no longer exists", 422);

  const user = await prismaAdmin.user.create({
    data: {
      email, firstName, lastName,
      jobTitle: jobTitle || null,
      tenantId: null,
      systemRole: "SUPER_ADMIN",
      isActive: false,
      passwordHash: "",
      centralRoleId,
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
