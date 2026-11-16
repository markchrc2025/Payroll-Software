/**
 * /api/employees/[id]/dtr/aggregate
 *   POST -- Aggregate APPROVED DTR records for a period -> upsert PeriodInput
 *
 * Phase AE1: full 25-scenario stacking matrix + "day before" holiday
 * entitlement check (DOLE Art. 94 interpretation).
 *
 * Body: { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD", replace?: boolean }
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { aggregateDtrSchema } from "@/lib/validations/dtr";
import { forbidUnless } from "@/lib/authz/route-permission";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
import { aggregateApprovedDtr } from "@/lib/payroll/dtr-aggregate";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["TIMESHEETS", "UPDATE"]);
  if (denied) return denied;
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = aggregateDtrSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { periodStart, periodEnd, replace } = parsed.data;

  if (periodEnd < periodStart)
    return err("periodEnd must be on or after periodStart", 422);

  const periodStartDate = new Date(periodStart + "T00:00:00.000Z");
  const periodEndDate   = new Date(periodEnd   + "T23:59:59.999Z");

  const result = await withTenant(auth.tenantId, async (tx) => {
    // The rollup itself lives in src/lib/payroll/dtr-aggregate.ts (PAY-142),
    // shared with payroll runs that read approved DTR for their cutoff.
    const agg = await aggregateApprovedDtr(tx, {
      tenantId: auth.tenantId,
      employeeId,
      periodStartDate,
      periodEndDate,
    });
    if (agg.status !== "OK") return agg.status;
    const data = agg.data;

    const existing = await tx.periodInput.findFirst({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
      },
      select: { id: true },
    });

    if (existing && !replace) {
      return {
        skipped: true,
        message: "PeriodInput already exists. Pass replace:true to overwrite.",
        periodInputId: existing.id,
      };
    }

    if (existing) {
      return tx.periodInput.update({ where: { id: existing.id }, data });
    }

    return tx.periodInput.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
        ...data,
      },
    });
  });

  if (result === "NOT_FOUND") return notFound();
  if (result === "NOT_APPROVED")
    return err(
      "DTR for this period is not manager-approved. Submit and approve the DTR before running payroll.",
      409,
    );
  return ok(result, "DTR aggregated into PeriodInput");
}
