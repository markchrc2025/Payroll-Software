/**
 * /api/employees/[id]/leave-transactions
 *   GET   list an employee's leave transactions: the employee themself, the
 *         company owner, or a role granted LEAVES:READ (unit 0.22 Am 1, B6)
 *   POST  REFUSED. Leave is filed by the employee in ESS (/api/ess/leaves).
 *         No one files on another employee's behalf (ruling B6, data privacy).
 *         This route used to file for ANY employee, for ANY signed-in user,
 *         and with no approval chain it approved on the spot.
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, forbidden, paginated, unauthorized } from "@/lib/api-response";
import { listLeaveTransactionsSchema } from "@/lib/validations/leave";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { FILE_IN_ESS, maySeeEmployeeRecords } from "@/lib/approvals/second-party";

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

  const result = await withTenant(auth.tenantId, async (tx) => {
    if (!(await maySeeEmployeeRecords(tx, auth, employeeId, "LEAVE"))) return null;
    return Promise.all([
      tx.leaveTransaction.findMany({
        where,
        include: { leaveType: true },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.leaveTransaction.count({ where }),
    ]);
  });
  if (!result) return forbidden("You cannot see this employee's leave records");
  const [rows, total] = result;

  return paginated(
    rows.map((r) => ({ ...serializeLeaveTransaction(r), leaveType: r.leaveType })),
    total,
    page,
    limit,
  );
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  return forbidden(FILE_IN_ESS);
}
