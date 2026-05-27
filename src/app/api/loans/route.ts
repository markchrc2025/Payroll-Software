/**
 * /api/loans
 *   GET  — list (filter: employeeId, status, loanType)
 *   POST — create a loan
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, paginated, unauthorized } from "@/lib/api-response";
import { toCentavos } from "@/lib/money";
import {
  createLoanSchema,
  listLoansSchema,
} from "@/lib/validations/pay-component";
import { serializeLoan } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listLoansSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { employeeId, status, loanType, page, limit } = parsed.data;

  const where: Prisma.LoanWhereInput = {
    tenantId: auth.tenantId,
    ...(employeeId && { employeeId }),
    ...(status && { status }),
    ...(loanType && { loanType }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.loan.findMany({
        where,
        orderBy: [{ startDate: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.loan.count({ where }),
    ]),
  );

  return paginated(rows.map(serializeLoan), total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createLoanSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const principalCents = toCentavos(d.principal);
  const installmentCents = toCentavos(d.installment);
  const balanceCents = d.balance ? toCentavos(d.balance) : principalCents;

  if (installmentCents <= 0n || principalCents <= 0n) {
    return err("principal and installment must be > 0", 422);
  }

  const created = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: d.employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return null;

    return tx.loan.create({
      data: {
        tenantId: auth.tenantId,
        employeeId: d.employeeId,
        loanType: d.loanType,
        referenceNumber: d.referenceNumber ?? null,
        principalCents,
        installmentCents,
        balanceCents,
        startDate: d.startDate,
        notes: d.notes ?? null,
      },
    });
  });

  if (!created) return notFound("Employee");
  return ok(serializeLoan(created), "Loan created", 201);
}
