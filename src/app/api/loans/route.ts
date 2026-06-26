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
import { toCentavos, formatCentavos } from "@/lib/money";
import {
  createLoanSchema,
  listLoansSchema,
} from "@/lib/validations/pay-component";
import { serializeLoan } from "@/lib/payroll/serialize";
import { checkDeductionCap } from "@/lib/payroll/deduction-cap";
import { writeAuditLog, getClientIp } from "@/lib/audit";

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

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: d.employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return { kind: "not_found" as const };

    // "No negative pay" safeguard: block a loan whose installment would push
    // the employee's statutory + loan deductions past the tenant's cap.
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: auth.tenantId },
      select: { maxDeductionPctOfGross: true },
    });
    const cap = await checkDeductionCap(
      tx,
      auth.tenantId,
      d.employeeId,
      installmentCents,
      tenant.maxDeductionPctOfGross,
      d.startDate,
    );
    if (cap && !cap.withinCap) {
      return { kind: "over_cap" as const, cap };
    }

    const loan = await tx.loan.create({
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
    return { kind: "created" as const, loan };
  });

  if (result.kind === "not_found") return notFound("Employee");
  if (result.kind === "over_cap") {
    const { cap } = result;
    return err(
      `This loan would exceed the deduction limit of ${cap.maxPct}% of monthly gross. ` +
        `Remaining installment capacity is ₱${formatCentavos(cap.remainingPerPeriodCents)} per pay period. ` +
        `Reduce the installment or settle existing loans before adding this one.`,
      422,
      {
        maxPct: cap.maxPct,
        monthlyGrossCents: cap.monthlyGrossCents.toString(),
        monthlyStatutoryCents: cap.monthlyStatutoryCents.toString(),
        capCents: cap.capCents.toString(),
        remainingPerPeriodCents: cap.remainingPerPeriodCents.toString(),
      },
    );
  }
  const created = result.loan;
  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "CREATE",
    entity: "Loan",
    entityId: created.id,
    changes: { loanType: d.loanType, employeeId: d.employeeId },
    ipAddress: getClientIp(req),
  });
  return ok(serializeLoan(created), "Loan created", 201);
}
