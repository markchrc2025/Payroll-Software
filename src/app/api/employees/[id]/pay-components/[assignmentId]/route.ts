/**
 * /api/employees/[id]/pay-components/[assignmentId]
 *   DELETE — hard-delete a pay-component assignment.
 *            (Components are immutable amounts; to change, end-date and create a new one.)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeEmployeePayComponent } from "@/lib/payroll/serialize";

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId, assignmentId } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employeePayComponent.findFirst({
      where: { id: assignmentId, tenantId: auth.tenantId, employeeId },
    });
    if (!existing) return null;
    return tx.employeePayComponent.delete({ where: { id: assignmentId } });
  });

  if (!deleted) return notFound("PayComponent assignment");
  return ok(
    serializeEmployeePayComponent(deleted),
    "Assignment removed",
  );
}
