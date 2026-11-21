/** PAY-197 part 2: PUT the personal information form (the employee's own case only). */
import type { NextRequest } from "next/server";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { getPortalSession, personalInfoSchema, savePersonalInfo } from "@/lib/offboarding/portal";

export async function PUT(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  const parsed = personalInfoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid form", 422);
  await withTenant(ctx.tenantId, (tx) => savePersonalInfo(tx, ctx, parsed.data));
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: null, action: "UPDATE", entity: "OffboardingCase", entityId: ctx.caseId, changes: { personalInfo: "submitted", by: "offboarding portal" }, ipAddress: null });
  return ok(null);
}
