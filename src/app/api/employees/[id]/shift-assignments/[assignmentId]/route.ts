/**
 * /api/employees/[id]/shift-assignments/[assignmentId]
 *   DELETE — remove a shift assignment
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["TIMESHEETS", "UPDATE"]);
  if (denied) return denied;
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
