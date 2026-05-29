/**
 * POST /api/incidents/[id]/resolve — HR resolves or closes an incident.
 *
 * Sets resolution text, resolvedAt timestamp, and transitions status to
 * RESOLVED or CLOSED.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { resolveIncidentSchema } from "@/lib/validations/incident";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "INCIDENTS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = resolveIncidentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { resolution, status } = parsed.data;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!existing) return notFound("Incident");
  if (existing.status === "CLOSED") return err("Incident is already closed.", 409);

  const updated = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.update({
      where: { id },
      data: {
        resolution,
        status,
        resolvedAt: new Date(),
        resolvedByUserId: ctx.userId,
      },
    }),
  );

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "UPDATE",
    entity: "IncidentReport",
    entityId: id,
    changes: { action: "resolve", newStatus: status },
    ipAddress: getClientIp(req),
  });

  return ok(updated, "Incident resolved");
}
