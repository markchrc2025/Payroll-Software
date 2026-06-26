/**
 * /api/loans/capacity
 *   GET — remaining per-pay-period loan-installment capacity for an employee
 *         under the tenant's "no negative pay" deduction cap.
 *
 * Drives the proactive capacity hint on the New Loan form: the operator sees
 * how much room is left BEFORE submitting, instead of finding out via a 422.
 *
 * Query: ?employeeId=<id>&asOf=<YYYY-MM-DD?>  (asOf defaults to today)
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { checkDeductionCap } from "@/lib/payroll/deduction-cap";

const querySchema = z.object({
  employeeId: z.string().min(1),
  // Optional ISO date (loan start). Used to resolve the in-force salary +
  // statutory rules as of that date.
  asOf: z.string().date().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());

  const asOf = parsed.data.asOf ? new Date(parsed.data.asOf) : new Date();

  const result = await withTenant(auth.tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: auth.tenantId },
      select: { maxDeductionPctOfGross: true },
    });
    const cap = await checkDeductionCap(
      tx,
      auth.tenantId,
      parsed.data.employeeId,
      0n, // probe current headroom, before any new loan
      tenant.maxDeductionPctOfGross,
      asOf,
    );
    return { cap, maxPct: tenant.maxDeductionPctOfGross };
  });

  // No in-force salary to evaluate against → cap can't be enforced yet.
  if (!result.cap) {
    return ok({ enforced: false, maxPct: result.maxPct });
  }

  const { cap } = result;
  return ok({
    enforced: true,
    maxPct: cap.maxPct,
    monthlyGrossCents: cap.monthlyGrossCents.toString(),
    monthlyStatutoryCents: cap.monthlyStatutoryCents.toString(),
    capCents: cap.capCents.toString(),
    remainingPerPeriodCents: cap.remainingPerPeriodCents.toString(),
  });
}
