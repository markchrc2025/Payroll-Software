/**
 * GET /api/undertime-requests
 *
 * HR/Admin list of all undertime requests across employees (paginated).
 *
 * Query params:
 *   employeeId?  — filter by employee
 *   status?      — PENDING | APPROVED | REJECTED | CANCELLED
 *   dateFrom?    — ISO date string (inclusive)
 *   dateTo?      — ISO date string (inclusive)
 *   page         — default 1
 *   limit        — default 50, max 200
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, paginated } from "@/lib/api-response";

const listSchema = z.object({
  employeeId: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { employeeId, status, dateFrom, dateTo, page, limit } = parsed.data;

  const where: Prisma.UndertimeRequestWhereInput = {
    tenantId: auth.tenantId,
    ...(employeeId && { employeeId }),
    ...(status && { status }),
    ...((dateFrom || dateTo) && {
      date: {
        ...(dateFrom && { gte: new Date(dateFrom + "T00:00:00.000Z") }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59.999Z") }),
      },
    }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.undertimeRequest.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
        },
      }),
      tx.undertimeRequest.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}
