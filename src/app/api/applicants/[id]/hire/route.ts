/**
 * POST /api/applicants/[id]/hire
 *
 * Converts an applicant to an Employee record:
 *   1. Creates a minimal Employee row (firstName, lastName, email) under this tenant.
 *   2. Sets applicant.stage = "HIRED" and links hiredEmployeeId.
 *   3. Returns { employeeId } so the caller can redirect to /employees/[id].
 *
 * Only applicants in the OFFER stage may be hired (or any non-terminal stage;
 * the API enforces stage = OFFER to prevent accidental hires).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const applicant = await tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!applicant) return { notFound: true as const };
    if (applicant.stage === "HIRED") {
      return { alreadyHired: true as const, employeeId: applicant.hiredEmployeeId ?? "" };
    }
    if (applicant.stage === "REJECTED" || applicant.stage === "WITHDRAWN") {
      return { error: `Cannot hire applicant in stage ${applicant.stage}` };
    }

    // Generate a unique employee number
    const count = await tx.employee.count({ where: { tenantId: ctx.tenantId } });
    const employeeNumber = `EMP-${String(count + 1).padStart(5, "0")}`;

    const employee = await tx.employee.create({
      data: {
        tenantId: ctx.tenantId,
        employeeNumber,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        personalEmail: applicant.email ?? null,
        employmentStatus: "PROBATIONARY",
        hireDate: new Date(),
      },
      select: { id: true },
    });

    await tx.applicant.update({
      where: { id },
      data: { stage: "HIRED", hiredEmployeeId: employee.id },
    });

    return { employeeId: employee.id };
  });

  if ("notFound" in result) return notFound("Applicant");
  if ("error" in result) return err(result.error as string, 409);
  if ("alreadyHired" in result) return ok({ employeeId: result.employeeId }, "Already hired");
  return ok({ employeeId: result.employeeId }, "Applicant hired", 201);
}
