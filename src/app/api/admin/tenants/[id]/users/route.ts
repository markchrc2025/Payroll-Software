/**
 * GET  /api/admin/tenants/[id]/users — list users for a tenant
 * POST /api/admin/tenants/[id]/users — create a new admin user for a tenant
 *
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { z } from "zod";

const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCentralPermission("TENANTS", "READ");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;

  const tenant = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) return notFound("Tenant");

  const users = await prismaAdmin.user.findMany({
    where: { tenantId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      systemRole: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      assignedRole: { select: { name: true } },
    },
  });

  return ok(users);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCentralPermission("TENANTS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;

  const tenant = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) return notFound("Tenant");

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prismaAdmin.user.create({
      data: {
        tenantId: id,
        email: parsed.data.email,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        systemRole: "TENANT_USER",
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        systemRole: true,
        isActive: true,
        createdAt: true,
      },
    });
    return ok(user, "User created", 201);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return err("Email already exists for this tenant", 409);
    }
    return serverError(e);
  }
}
