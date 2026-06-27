/**
 * GET /api/profile-update-requests
 *
 * Tenant-wide list of employee profile update requests.
 * Filters: status, employeeId, page, limit.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, paginated } from "@/lib/api-response";

const listSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  employeeId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { status, employeeId, page, limit } = parsed.data;

  const where: Prisma.ProfileUpdateRequestWhereInput = {
    tenantId: auth.tenantId,
    ...(status && { status }),
    ...(employeeId && { employeeId }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.profileUpdateRequest.findMany({
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
      tx.profileUpdateRequest.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}
