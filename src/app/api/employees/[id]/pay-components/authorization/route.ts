/**
 * POST /api/employees/[id]/pay-components/authorization  (PAY-150)
 * Uploads the employee's signed deduction authorization (multipart "file":
 * JPG, PNG, WEBP or PDF, at most 10 MB) and returns its key, to be saved on
 * the deduction's assignment.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { notFound, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { storeAuthorization } from "@/lib/payroll/deduction-authorizations";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const emp = await withTenant(auth.tenantId, (tx) => tx.employee.findFirst({ where: { id, tenantId: auth.tenantId }, select: { id: true } }));
  if (!emp) return notFound("Employee");
  const stored = await storeAuthorization(req, auth.tenantId);
  if ("error" in stored) return stored.error;
  return ok({ key: stored.key }, "Authorization uploaded", 201);
}
