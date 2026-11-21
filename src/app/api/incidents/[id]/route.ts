/**
 * GET   /api/incidents/[id] — Get a single incident report.
 * PATCH /api/incidents/[id] — Update incident details (HR/admin use).
 */
import type { NextRequest } from "next/server";
import { IncidentListRefusal, resolveIncidentLists } from "@/lib/incidents/lists";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { updateIncidentSchema } from "@/lib/validations/incident";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "INCIDENTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const incident = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            branchId: true,
          },
        },
      },
    }),
  );

  if (!incident) return notFound("Incident");

  return ok(incident);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "INCIDENTS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateIncidentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!existing) return notFound("Incident");

  const { attachmentUrls, type, typeId, categoryId, ...rest } = parsed.data;

  let updated;
  try {
  updated = await withTenant(ctx.tenantId, async (tx) =>
    tx.incidentReport.update({
      where: { id },
      data: {
        ...rest,
        // Wave A3 (PAY-210): from the company's lists.
        ...(await resolveIncidentLists(tx, ctx.tenantId, { type, typeId, categoryId })),
        ...(attachmentUrls !== undefined && { attachmentUrls }),
      },
    }),
  );
  } catch (e) {
    if (e instanceof IncidentListRefusal) return err(e.message, 422);
    throw e;
  }

  return ok(updated);
}
