/**
 * GET /api/employees/ess — employees with their Employee Self-Service (ESS)
 * access status, for the ESS admin portal.
 *
 * Requires EMPLOYEES:READ.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const q = req.nextUrl.searchParams.get("search")?.trim();
  const status = req.nextUrl.searchParams.get("status")?.trim();

  const where: Prisma.EmployeeWhereInput = {
    tenantId: ctx.tenantId,
    deletedAt: null,
    ...(status ? { essAccessStatus: status as Prisma.EnumEssAccessStatusFilter["equals"] } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { employeeNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        employmentStatus: true,
        essAccessStatus: true,
        essInvitedAt: true,
        essActivatedAt: true,
        essLastLoginAt: true,
        essDeactivateAt: true,
        essDeactivateReason: true,
        essPin: true,
      },
    }),
  );

  const data = rows.map((r) => ({
    id: r.id,
    employeeNumber: r.employeeNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    workEmail: r.workEmail,
    employmentStatus: r.employmentStatus,
    essAccessStatus: r.essAccessStatus,
    essInvitedAt: r.essInvitedAt?.toISOString() ?? null,
    essActivatedAt: r.essActivatedAt?.toISOString() ?? null,
    essLastLoginAt: r.essLastLoginAt?.toISOString() ?? null,
    essDeactivateAt: r.essDeactivateAt?.toISOString() ?? null,
    essDeactivateReason: r.essDeactivateReason,
    hasEssPin: r.essPin !== null,
  }));

  return ok(data);
}
