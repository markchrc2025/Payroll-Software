/**
 * POST /api/ess/incidents/[id]/respond — Employee submits their NTE response.
 *
 * The employee can only respond to their own incident reports.
 * A response can only be submitted when the incident is in OPEN or UNDER_REVIEW status.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getEssContext } from "@/lib/ess-auth";
import { ok, err, notFound, unauthorized } from "@/lib/api-response";
import { respondIncidentSchema } from "@/lib/validations/incident";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = respondIncidentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { employeeResponse } = parsed.data;

  const incident = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    }),
  );

  if (!incident) return notFound("Incident");
  if (incident.employeeId !== ctx.employeeId) return err("Forbidden", 403);
  if (incident.status === "RESOLVED" || incident.status === "CLOSED") {
    return err("Cannot respond to a resolved or closed incident.", 409);
  }

  // Enforce response deadline if set
  if (incident.responseDeadline && new Date() > incident.responseDeadline) {
    return err("Response deadline has passed.", 409);
  }

  const updated = await withTenant(ctx.tenantId, (tx) =>
    tx.incidentReport.update({
      where: { id },
      data: {
        employeeResponse,
        status: "UNDER_REVIEW",
      },
    }),
  );

  return ok(updated, "Response submitted");
}
