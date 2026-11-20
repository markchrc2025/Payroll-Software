/**
 * GET /api/employees/[id]/pay-components/[assignmentId]/authorization  (PAY-150)
 * A 5-minute link to view the signed deduction authorization on file.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { authorizationViewUrl, isTenantAuthorizationKey } from "@/lib/payroll/deduction-authorizations";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;
  const { id: employeeId, assignmentId } = await params;
  const row = await withTenant(auth.tenantId, (tx) =>
    tx.employeePayComponent.findFirst({ where: { id: assignmentId, tenantId: auth.tenantId, employeeId }, select: { authorizationFileKey: true } }),
  );
  if (!row) return notFound("PayComponent assignment");
  if (!row.authorizationFileKey || !isTenantAuthorizationKey(auth.tenantId, row.authorizationFileKey)) return notFound("Authorization");
  const url = await authorizationViewUrl(row.authorizationFileKey);
  if (!url) return err("File storage is not configured on the server. Contact your administrator.", 503);
  return ok({ url });
}
