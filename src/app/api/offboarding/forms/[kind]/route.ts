/**
 * PAY-197: what HR reads under each Offboarding submenu, across all cases
 * (src/lib/offboarding/hr-forms.ts): questionnaires, personal-info, final-pay.
 * EMPLOYEES:READ, as the cases themselves.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { FORM_KINDS, finalPay, personalInfo, questionnaires, type FormKind } from "@/lib/offboarding/hr-forms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const { kind } = await params;
  if (!FORM_KINDS.includes(kind as FormKind)) return err("Unknown form", 404);
  const data = await withTenant<unknown>(auth.tenantId, (tx) =>
    kind === "questionnaires" ? questionnaires(tx, auth.tenantId) : kind === "personal-info" ? personalInfo(tx, auth.tenantId) : finalPay(tx, auth.tenantId));
  return ok(data);
}
