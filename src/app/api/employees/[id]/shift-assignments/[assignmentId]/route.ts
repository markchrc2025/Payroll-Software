/**
 * /api/employees/[id]/shift-assignments/[assignmentId]
 *   DELETE — remove a shift assignment
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId, assignmentId } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employeeShiftAssignment.findFirst({
      where: {
        id: assignmentId,
        employeeId,
        tenantId: auth.tenantId,
      },
      select: { id: true },
    });
    if (!existing) return null;

    return tx.employeeShiftAssignment.delete({ where: { id: assignmentId } });
  });

  if (!deleted) return notFound();
  return ok({ id: deleted.id }, "Shift assignment removed");
}
