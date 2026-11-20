/**
 * /api/employees/[id]/pay-components/[assignmentId]
 *   PATCH  — PAY-150: add or correct a deduction's written authorization,
 *            incident record and actual loss, or end the assignment.
 *   DELETE — hard-delete a pay-component assignment.
 *            (Components are immutable amounts; to change, end-date and create a new one.)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { toCentavos } from "@/lib/money";
import { updateAssignmentGuardSchema } from "@/lib/validations/pay-component";
import { guardFieldsProblem } from "@/lib/payroll/deduction-authorizations";
import { serializeEmployeePayComponent } from "@/lib/payroll/serialize";
import { forbidUnless } from "@/lib/authz/route-permission";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const { id: employeeId, assignmentId } = await params;
  const parsed = updateAssignmentGuardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employeePayComponent.findFirst({
      where: { id: assignmentId, tenantId: auth.tenantId, employeeId },
      include: { payComponent: { select: { kind: true, isLossOrDamage: true } } },
    });
    if (!existing) return null;
    const actualLossCents = d.actualLoss === undefined ? undefined : d.actualLoss === null ? null : toCentavos(d.actualLoss);
    const problem = await guardFieldsProblem(tx, {
      tenantId: auth.tenantId, employeeId, component: existing.payComponent,
      authorizationFileKey: d.authorizationFileKey, incidentReportId: d.incidentReportId, actualLossCents,
    });
    if (problem) return { problem };
    if (d.endDate && d.endDate < existing.effectiveFrom) return { problem: "The end date is before the start date." };
    const row = await tx.employeePayComponent.update({
      where: { id: assignmentId },
      data: {
        ...(d.authorizationDate !== undefined && { authorizationDate: d.authorizationDate }),
        ...(d.authorizationFileKey !== undefined && { authorizationFileKey: d.authorizationFileKey }),
        ...(d.incidentReportId !== undefined && { incidentReportId: d.incidentReportId }),
        ...(actualLossCents !== undefined && { actualLossCents }),
        ...(d.endDate !== undefined && { endDate: d.endDate }),
      },
    });
    return { row };
  });
  if (!result) return notFound("PayComponent assignment");
  if ("problem" in result) return err(result.problem as string, 422);
  return ok(serializeEmployeePayComponent(result.row), "Assignment updated");
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
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
