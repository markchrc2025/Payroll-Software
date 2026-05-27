/**
 * GET /api/movements — Tenant-wide movement list (filter by status/employeeId).
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { paginated, unauthorized, err } from "@/lib/api-response";
import { listMovementsSchema } from "@/lib/validations/movement";
import { serializeMovement } from "@/lib/movements/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listMovementsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { status, employeeId, page, limit } = parsed.data;

  const where: Prisma.EmployeeMovementWhereInput = {
    tenantId: auth.tenantId,
    ...(status && { approvalStatus: status }),
    ...(employeeId && { employeeId }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.employeeMovement.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: { id: true, employeeNumber: true, firstName: true, lastName: true },
          },
        },
      }),
      tx.employeeMovement.count({ where }),
    ]),
  );

  return paginated(rows.map(serializeMovement), total, page, limit);
}
