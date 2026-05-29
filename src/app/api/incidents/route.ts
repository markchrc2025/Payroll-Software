/**
 * GET  /api/incidents — Tenant-wide incident list.
 * POST /api/incidents — Create a new incident report / NTE.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, paginated, err } from "@/lib/api-response";
import { createIncidentSchema, listIncidentsSchema } from "@/lib/validations/incident";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "INCIDENTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listIncidentsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { type, status, employeeId, page, limit } = parsed.data;

  const where: Prisma.IncidentReportWhereInput = {
    tenantId: ctx.tenantId,
    deletedAt: null,
    ...(type && { type }),
    ...(status && { status }),
    ...(employeeId && { employeeId }),
  };

  const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.incidentReport.findMany({
        where,
        orderBy: [{ incidentDate: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: { id: true, employeeNumber: true, firstName: true, lastName: true },
          },
        },
      }),
      tx.incidentReport.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "INCIDENTS", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { employeeId, attachmentUrls, ...rest } = parsed.data;

  // Verify employee belongs to tenant
  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!employee) return err("Employee not found", 404);

  const incident = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.create({
      data: {
        ...rest,
        employeeId,
        tenantId: ctx.tenantId,
        attachmentUrls: attachmentUrls ?? [],
        createdByUserId: ctx.userId,
      },
      include: {
        employee: {
          select: { id: true, employeeNumber: true, firstName: true, lastName: true },
        },
      },
    }),
  );

  return ok(incident, "Incident created", 201);
}
