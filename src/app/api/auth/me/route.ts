/**
 * GET /api/auth/me — returns the current authenticated user's identity
 * and their linked employee record (if any).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const user = await prismaAdmin.user.findFirst({
    where: { id: auth.userId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      systemRole: true,
      employee: { select: { id: true, employeeNumber: true } },
    },
  });

  return ok({
    userId: auth.userId,
    tenantId: auth.tenantId,
    systemRole: auth.systemRole,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    email: user?.email ?? null,
    employee: user?.employee ?? null,
  });
}
