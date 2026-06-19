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
import { snapshotApprovalChain } from "@/lib/approvals/snapshot";
import { splitLeaveUnits, resolveOrCreateBalance } from "@/lib/leave/filing";
import { finalizeLeaveApproval } from "@/lib/leave/apply-to-dtr";

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
  const { leaveTypeId, amount, startDate, endDate, dayPortion, reason } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
    });
    if (!employee) return "no_employee" as const;

    const leaveType = await tx.leaveType.findFirst({
      where: { id: leaveTypeId, tenantId: auth.tenantId, deletedAt: null, isActive: true },
    });
    if (!leaveType) return "no_leave_type" as const;

    // Resolve (or create) the balance for the year; split into paid + LWOP.
    const year = startDate.getUTCFullYear();
    const balance = await resolveOrCreateBalance(tx, auth.tenantId, employeeId, leaveTypeId, year);
    const { paidUnits, unpaidUnits } = leaveType.isPaid
      ? splitLeaveUnits(balance.available, amount)
      : { paidUnits: 0, unpaidUnits: amount };

    const leaveTransaction = await tx.leaveTransaction.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        leaveTypeId,
        leaveBalanceId: balance.id,
        type: "USAGE",
        amount,
        dayPortion,
        paidUnits,
        unpaidUnits,
        startDate,
        endDate,
        reason: reason ?? null,
        approvalStatus: "PENDING",
        createdByUserId: auth.userId,
        currentStepIndex: 0,
      },
    });

    // Snapshot the LEAVE approval chain (one ApprovalStep row per resolvable step).
    const snap = await snapshotApprovalChain(tx, {
      module: "LEAVE",
      entityId: leaveTransaction.id,
      requesterId: employeeId,
      tenantId: auth.tenantId,
    });

    // No resolvable approvers → auto-approve, debit paid units, write DTR.
    if (snap.activeSteps === 0) {
      const updated = await tx.leaveTransaction.update({
        where: { id: leaveTransaction.id },
        data: { approvalStatus: "APPROVED", approvedAt: new Date() },
      });
      await finalizeLeaveApproval(tx, leaveTransaction.id);
      return updated;
    }

    if (snap.firstStepIndex !== 0) {
      await tx.leaveTransaction.update({
        where: { id: leaveTransaction.id },
        data: { currentStepIndex: snap.firstStepIndex },
      });
    }

    return leaveTransaction;
  });

  if (result === "no_employee") return notFound("Employee");
  if (result === "no_leave_type") return notFound("LeaveType");

  return ok(serializeLeaveTransaction(result), "Leave request filed", 201);
}
