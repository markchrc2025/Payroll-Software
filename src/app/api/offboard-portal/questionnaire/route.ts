/** PAY-197 part 2: PUT the exit questionnaire (the employee's own case only). */
import type { NextRequest } from "next/server";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { exitQuestionnaireSchema, getPortalSession } from "@/lib/offboarding/portal";

export async function PUT(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  const parsed = exitQuestionnaireSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid questionnaire", 422);
  await withTenant(ctx.tenantId, (tx) => tx.offboardingCase.update({ where: { id: ctx.caseId }, data: { exitQuestionnaire: parsed.data, exitQuestionnaireAt: new Date() } }));
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: null, action: "UPDATE", entity: "OffboardingCase", entityId: ctx.caseId, changes: { exitQuestionnaire: "submitted", by: "offboarding portal" }, ipAddress: null });
  return ok(null);
}
