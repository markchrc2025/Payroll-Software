/**
 * GET /api/employees/[id]/passkeys: the ESS passkeys (WebAuthn credentials)
 * an employee has registered, for HR.
 *
 * Unit 0.20: until now no HR surface showed these. A passkey is created by the
 * employee in ESS, so the person offboarding them could finish every step the
 * product offers and still not know one exists. Since 0.14 a surviving passkey
 * no longer grants access on its own, so this is visibility and lifecycle, not
 * an open door.
 *
 * Returns metadata only: never the public key or the credential id.
 * Requires EMPLOYEES:READ.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return null;
    return tx.essWebAuthnCredential.findMany({
      where: { tenantId: ctx.tenantId, employeeId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, aaguid: true, createdAt: true, lastUsedAt: true },
    });
  });

  if (result === null) return notFound("Employee");
  return ok(
    result.map((c) => ({
      id: c.id,
      label: c.label,
      aaguid: c.aaguid,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    })),
  );
}
