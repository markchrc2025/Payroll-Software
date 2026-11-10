/**
 * DELETE /api/employees/[id]/passkeys/[credentialId]: HR removes one of an
 * employee's ESS passkeys (unit 0.20). The employee can still sign in with
 * their password, and can register a new passkey if their access allows.
 *
 * Scoped three ways (tenant, employee, credential row), so a credential id
 * from another employee or tenant deletes nothing and returns 404.
 * Requires EMPLOYEES:UPDATE. Audit-logged.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; credentialId: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id, credentialId } = await params;

  const removed = await withTenant(ctx.tenantId, async (tx) => {
    const cred = await tx.essWebAuthnCredential.findFirst({
      where: { id: credentialId, employeeId: id, tenantId: ctx.tenantId },
      select: { id: true, label: true },
    });
    if (!cred) return null;
    const res = await tx.essWebAuthnCredential.deleteMany({
      where: { id: credentialId, employeeId: id, tenantId: ctx.tenantId },
    });
    return res.count === 1 ? cred : null;
  });

  if (!removed) return notFound("Passkey");

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "DELETE",
    entity: "EssWebAuthnCredential",
    entityId: removed.id,
    changes: { employeeId: id, label: removed.label ?? null, by: "HR" },
    ipAddress: getClientIp(req),
  });

  return ok({ id: removed.id }, "Passkey removed");
}
