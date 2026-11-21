/**
 * POST /api/incidents/[id]/resolve — HR resolves or closes an incident.
 *
 * Sets resolution text, resolvedAt timestamp, and transitions status to
 * RESOLVED or CLOSED. Wave G3 (PAY-217): the decision's outcome is applied in
 * the same transaction (src/lib/incidents/outcomes.ts): a suspension writes
 * unpaid DTR days from suspensionStartDate, a dismissal opens offboarding.
 */
import type { NextRequest } from "next/server";
import { IncidentListRefusal, resolveDecision } from "@/lib/incidents/lists";
import { applyOutcomes, IncidentOutcomeError } from "@/lib/incidents/outcomes";
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
  const { resolution, status, decisionId, suspensionStartDate, lastWorkingDay } = parsed.data;
  const day = (v?: string) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!existing) return notFound("Incident");
  if (existing.status === "CLOSED") return err("Incident is already closed.", 409);

  // A decision whose outcome was already applied stays as it is.
  const applied = existing.suspensionDates != null || existing.offboardingCaseId != null;
  let updated;
  let outcome: Awaited<ReturnType<typeof applyOutcomes>> | null = null;
  try {
  updated = await withTenant(ctx.tenantId, async (tx) => {
    const u = await tx.incidentReport.update({
      where: { id },
      data: {
        // Wave A3 (PAY-210): the decision and its outcome, copied now.
        ...(applied ? {} : await resolveDecision(tx, ctx.tenantId, decisionId)),
        resolution,
        status,
        resolvedAt: new Date(),
        resolvedByUserId: ctx.userId,
      },
    });
    outcome = await applyOutcomes(tx, ctx.tenantId, ctx.userId ?? null, u, { suspensionStartDate: day(suspensionStartDate), lastWorkingDay: day(lastWorkingDay) });
    return tx.incidentReport.findUniqueOrThrow({ where: { id } });
  });
  } catch (e) {
    if (e instanceof IncidentListRefusal) return err(e.message, 422);
    if (e instanceof IncidentOutcomeError) return err(e.message, e.status);
    throw e;
  }

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "UPDATE",
    entity: "IncidentReport",
    entityId: id,
    changes: { action: "resolve", newStatus: status, decisionId: updated.decisionId, suspensionDays: updated.decisionSuspensionDays, dismissal: updated.decisionIsDismissal, outcome },
    ipAddress: getClientIp(req),
  });

  return ok(updated, "Incident resolved");
}
