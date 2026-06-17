/**
 * /api/employees/[id]/leave-transactions
 *   GET  — list leave transactions for an employee
 *   POST — file a leave request (USAGE type, PENDING status)
 *
 * Filing does NOT debit the balance — debit happens on approval.
 * Negative balance is allowed; managers decide on approval.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  fileLeaveRequestSchema,
  listLeaveTransactionsSchema,
} from "@/lib/validations/leave";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { resolveEffectiveWorkflow } from "@/lib/approvals/resolve-workflow";
import { resolveChain } from "@/lib/approvals/resolve-chain";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listLeaveTransactionsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { year, type, approvalStatus, page, limit } = parsed.data;

  const where: Prisma.LeaveTransactionWhereInput = {
    employeeId,
    tenantId: auth.tenantId,
    ...(type && { type }),
    ...(approvalStatus && { approvalStatus }),
    ...(year !== undefined && {
      startDate: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.leaveTransaction.findMany({
        where,
        include: { leaveType: true },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.leaveTransaction.count({ where }),
    ]),
  );

  return paginated(
    rows.map((r) => ({ ...serializeLeaveTransaction(r), leaveType: r.leaveType })),
    total,
    page,
    limit,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = fileLeaveRequestSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { leaveTypeId, amount, startDate, endDate, reason } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
    });
    if (!employee) return "no_employee" as const;

    const leaveType = await tx.leaveType.findFirst({
      where: { id: leaveTypeId, tenantId: auth.tenantId, deletedAt: null, isActive: true },
    });
    if (!leaveType) return "no_leave_type" as const;

    // Balance must exist for the year of startDate
    const year = startDate.getUTCFullYear();
    const balance = await tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (!balance) return "no_balance" as const;

    // Resolve approver chain from the effective workflow (LEAVE module).
    const workflow = await resolveEffectiveWorkflow(employeeId, auth.tenantId, "LEAVE", tx);
    const slots = workflow
      ? await resolveChain(employeeId, auth.tenantId, workflow.approverKeys, tx)
      : [];

    const hasActiveSteps = slots.some((s) => s !== null);

    const leaveTransaction = await tx.leaveTransaction.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        leaveTypeId,
        leaveBalanceId: balance.id,
        type: "USAGE",
        amount,
        startDate,
        endDate,
        reason: reason ?? null,
        approvalStatus: hasActiveSteps ? "PENDING" : "APPROVED",
        createdByUserId: auth.userId,
        currentStepIndex: 0,
      },
    });

    // If no workflow or all slots are null (no resolvable approvers), auto-approve
    // and debit balance immediately.
    if (!hasActiveSteps) {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: { increment: amount } },
      });
      return leaveTransaction;
    }

    // Snapshot one ApprovalStep row per resolvable step (null = unresolvable → omit).
    const activeSlots = slots.flatMap((slot, index) =>
      slot === null
        ? []
        : [
            {
              id: crypto.randomUUID().replace(/-/g, ""),
              tenantId: auth.tenantId,
              module: "LEAVE" as const,
              entityId: leaveTransaction.id,
              stepIndex: index,
              roleKey: slot.roleKey,
              approverEmployeeId: slot.approverEmployeeId,
              status: "PENDING" as const,
              updatedAt: new Date(),
            },
          ],
    );

    if (activeSlots.length > 0) {
      await tx.approvalStep.createMany({ data: activeSlots });
      // Set currentStepIndex to the first active step.
      await tx.leaveTransaction.update({
        where: { id: leaveTransaction.id },
        data: { currentStepIndex: activeSlots[0].stepIndex },
      });
    }

    return leaveTransaction;
  });

  if (result === "no_employee") return notFound("Employee");
  if (result === "no_leave_type") return notFound("LeaveType");
  if (result === "no_balance")
    return err("No leave balance found for this leave type and year", 422);

  return ok(serializeLeaveTransaction(result), "Leave request filed", 201);
}
