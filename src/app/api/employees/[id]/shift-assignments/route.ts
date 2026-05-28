/**
 * /api/employees/[id]/shift-assignments
 *   GET  — list shift assignments for an employee
 *   POST — create a new shift assignment
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { createShiftAssignmentSchema } from "@/lib/validations/dtr";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const employee = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
      select: { id: true },
    }),
  );
  if (!employee) return notFound();

  const assignments = await withTenant(auth.tenantId, (tx) =>
    tx.employeeShiftAssignment.findMany({
      where: { employeeId, tenantId: auth.tenantId },
      include: { shiftSchedule: { select: { name: true, type: true } } },
      orderBy: { effectiveFrom: "desc" },
    }),
  );

  return ok(assignments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createShiftAssignmentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return "NOT_FOUND_EMP";

    const shift = await tx.shiftSchedule.findFirst({
      where: {
        id: d.shiftScheduleId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!shift) return "NOT_FOUND_SHIFT";

    const effectiveFrom = new Date(d.effectiveFrom);
    const effectiveTo = d.effectiveTo ? new Date(d.effectiveTo) : null;

    if (effectiveTo && effectiveTo <= effectiveFrom) {
      return "INVALID_DATES";
    }

    return tx.employeeShiftAssignment.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        shiftScheduleId: d.shiftScheduleId,
        effectiveFrom,
        effectiveTo,
      },
      include: { shiftSchedule: { select: { name: true, type: true } } },
    });
  });

  if (result === "NOT_FOUND_EMP") return notFound();
  if (result === "NOT_FOUND_SHIFT")
    return err("Shift schedule not found", 404);
  if (result === "INVALID_DATES")
    return err("effectiveTo must be after effectiveFrom", 422);

  return ok(result, "Shift assignment created", 201);
}
