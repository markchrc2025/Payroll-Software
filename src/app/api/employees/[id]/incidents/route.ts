/**
 * GET  /api/employees/[id]/incidents — List all incident reports for an employee.
 * POST /api/employees/[id]/incidents — Create an incident report against this employee.
 */
import type { NextRequest } from "next/server";
import { IncidentListRefusal, resolveIncidentLists } from "@/lib/incidents/lists";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, paginated, err, notFound } from "@/lib/api-response";
import { createIncidentSchema } from "@/lib/validations/incident";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "INCIDENTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!employee) return notFound("Employee");

  const qp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(qp.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(qp.get("limit") ?? 20)));

  const where = { employeeId: id, tenantId: ctx.tenantId, deletedAt: null as null };
  const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.incidentReport.findMany({
        where,
        orderBy: [{ incidentDate: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.incidentReport.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "INCIDENTS", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!employee) return notFound("Employee");

  const body = await req.json().catch(() => null);
  // Inject employeeId from the URL so the shared schema validates cleanly
  const parsed = createIncidentSchema.safeParse({ ...body, employeeId: id });
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  // employeeId comes from the URL (set again below).
  const { attachmentUrls, type, typeId, categoryId, ...fields } = parsed.data;
  let incident;
  try {
  incident = await withTenant(ctx.tenantId, async (tx) =>
    tx.incidentReport.create({
      data: {
        ...fields,
        // Wave A3 (PAY-210): from the company's lists.
        ...(await resolveIncidentLists(tx, ctx.tenantId, { type, typeId, categoryId })) as { type: NonNullable<typeof type> },
        employeeId: id,
        tenantId: ctx.tenantId,
        attachmentUrls: attachmentUrls ?? [],
        createdByUserId: ctx.userId,
      },
    }),
  );
  } catch (e) {
    if (e instanceof IncidentListRefusal) return err(e.message, 422);
    throw e;
  }

  return ok(incident, "Incident created", 201);
}
