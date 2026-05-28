/**
 * /api/employees/[id]/leave-balances
 *   GET — list leave balances for an employee (optional ?year=YYYY filter)
 *   PUT — upsert opening balance for a (leaveTypeId, year) pair
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { listLeaveBalancesSchema, upsertLeaveBalanceSchema } from "@/lib/validations/leave";
import { serializeLeaveBalance } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listLeaveBalancesSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { year } = parsed.data;

  const rows = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
    });
    if (!employee) return null;

    return tx.leaveBalance.findMany({
      where: {
        employeeId,
        tenantId: auth.tenantId,
        ...(year !== undefined && { year }),
      },
      include: { leaveType: true },
      orderBy: [{ year: "desc" }, { leaveType: { code: "asc" } }],
    });
  });

  if (rows === null) return notFound("Employee");
  return ok(rows.map((r) => ({ ...serializeLeaveBalance(r), leaveType: r.leaveType })));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = upsertLeaveBalanceSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { leaveTypeId, year, openingBalance } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    // Validate employee
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
    });
    if (!employee) return "no_employee" as const;

    // Validate leave type belongs to tenant
    const leaveType = await tx.leaveType.findFirst({
      where: { id: leaveTypeId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!leaveType) return "no_leave_type" as const;

    return tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
      create: {
        tenantId: auth.tenantId,
        employeeId,
        leaveTypeId,
        year,
        openingBalance,
      },
      update: { openingBalance },
    });
  });

  if (result === "no_employee") return notFound("Employee");
  if (result === "no_leave_type") return notFound("LeaveType");
  return ok(serializeLeaveBalance(result), "LeaveBalance upserted");
}
