/**
 * Job: leave.accrual — grants leave for COMPLETED entitlement periods (unit 0.13).
 *
 * Runs DAILY, and that is deliberate (D-F). Before 0.13 a daily run was the bug:
 * the handler iterated every active leave type × every non-resigned employee and
 * added the full accrual amount to the running balance on every pass, so a
 * MONTHLY entitlement accrued roughly thirty times a month, bounded only by
 * `maxAccruableBalance` where one was set. Now every grant is keyed
 * (entitlementId, type, periodKey) under a UNIQUE constraint, so a repeat run is
 * a no-op and the daily cadence becomes a self-healing sweep — which is strictly
 * safer than a monthly cron, because pg-boss drops any scheduled occurrence it
 * does not see within 60 seconds of its due time (timekeeper.js `shouldSendIt`),
 * and a monthly cron that misses its slot loses the whole month.
 *
 * Idempotency comes from the DATABASE, never from a read-then-write check: the
 * ACCRUAL row is inserted unconditionally and a unique violation means "already
 * granted". That is atomic, so it holds under pg-boss retries and concurrent
 * runs, which a check-then-insert does not.
 *
 * Uses prismaAdmin (bypasses RLS) since this runs as a background job.
 */

import prismaAdmin from "@/lib/prisma-admin";
import Decimal from "decimal.js";

import {
  computeAccrual,
  lastCompletedPeriod,
  todayInTimezone,
  type AccrualPeriodKind,
} from "@/lib/leave/accrual-math";

/** Period keys for the two grants that happen once per ENTITLEMENT, not per period. */
const LUMP_KEY = "LUMP";
const REGULARIZATION_KEY = "REGULARIZATION";

type Frequency = "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "UPON_REGULARIZATION" | "LUMP_SUM";

function isPeriodic(f: Frequency): f is AccrualPeriodKind {
  return f === "MONTHLY" || f === "QUARTERLY" || f === "ANNUALLY";
}

function asDay(v: unknown): Date | null {
  if (!(v instanceof Date)) return null;
  return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function handleLeaveAccrual(): Promise<void> {
  const now = new Date();
  let granted = 0;
  let skipped = 0;

  const tenants = (await prismaAdmin.tenant.findMany({
    where: { deletedAt: null },
  })) as unknown as Array<{ id: string; timezone?: string | null }>;

  for (const tenant of tenants) {
    // D-G: period boundaries follow the tenant's timezone, not a hardcoded offset.
    const today = todayInTimezone(now, tenant.timezone || "UTC");

    const entitlements = (await prismaAdmin.leaveEntitlement.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
    })) as unknown as Array<{
      id: string;
      tenantId: string;
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      endDate: Date | null;
      proRate: boolean;
      accrualAmount: Decimal.Value;
      accrualFrequency: Frequency;
    }>;

    if (entitlements.length === 0) continue;

    const employees = (await prismaAdmin.employee.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
    })) as unknown as Array<{
      id: string;
      regularizationDate: Date | null;
      resignationDate: Date | null;
      lastWorkingDate: Date | null;
    }>;
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const leaveTypes = (await prismaAdmin.leaveType.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
    })) as unknown as Array<{ id: string; maxAccruableBalance: Decimal.Value | null }>;
    const leaveTypeById = new Map(leaveTypes.map((t) => [t.id, t]));

    for (const ent of entitlements) {
      const employee = employeeById.get(ent.employeeId);
      if (!employee) continue;

      const start = asDay(ent.startDate);
      if (!start || start.getTime() > today.getTime()) continue; // not started yet

      // D-H: "served" = employed and not resigned. Unpaid leave / AWOL are out
      // of scope for this unit.
      const servedUntil = asDay(employee.lastWorkingDate) ?? asDay(employee.resignationDate);
      const entEnd = asDay(ent.endDate);
      const freq = ent.accrualFrequency;

      let periodKey: string;
      let amount: Decimal;
      let year: number;
      let toOpeningBalance = false;

      if (freq === "LUMP_SUM") {
        // D-C: the FULL entitlement, upfront on the start date, exactly once —
        // and into openingBalance, because it was never earned.
        periodKey = LUMP_KEY;
        amount = new Decimal(ent.accrualAmount);
        year = start.getUTCFullYear();
        toOpeningBalance = true;
      } else if (freq === "UPON_REGULARIZATION") {
        // D-H: once per ENTITLEMENT, and finally driven by regularizationDate
        // rather than employmentStatus.
        const reg = asDay(employee.regularizationDate);
        if (!reg || reg.getTime() > today.getTime()) continue;
        periodKey = REGULARIZATION_KEY;
        amount = new Decimal(ent.accrualAmount);
        year = reg.getUTCFullYear();
      } else if (isPeriodic(freq)) {
        // D-E: one code path for MONTHLY / QUARTERLY / ANNUALLY.
        // D-H: forward only — the most recently completed period, never a
        // back-fill of everything a back-dated entitlement missed.
        const period = lastCompletedPeriod(freq, today);
        if (period.end.getTime() < start.getTime()) continue; // entitlement began after it
        if (entEnd && period.start.getTime() > entEnd.getTime()) continue; // ended before it

        const result = computeAccrual({
          period,
          entitlementStart: start,
          entitlementEnd: entEnd,
          servedUntil,
          proRate: ent.proRate,
          accrualAmount: ent.accrualAmount,
        });
        if (result.coveredDays === 0) continue;

        periodKey = period.key;
        amount = result.amount;
        year = period.year; // D-H: the year the period ENDS in
      } else {
        continue;
      }

      const applied = await grantOnce({
        ent,
        periodKey,
        amount,
        year,
        toOpeningBalance,
        maxAccruableBalance: leaveTypeById.get(ent.leaveTypeId)?.maxAccruableBalance ?? null,
      });

      if (applied) granted += 1;
      else skipped += 1;
    }
  }

  console.log(
    `[jobs/leave.accrual] Done — ${granted} period(s) granted, ${skipped} already granted or capped-out`,
  );
}

/**
 * Grant one period for one entitlement, or do nothing if it was already granted.
 * Returns true when a new grant was written.
 */
async function grantOnce(args: {
  ent: { id: string; tenantId: string; employeeId: string; leaveTypeId: string };
  periodKey: string;
  amount: Decimal;
  year: number;
  toOpeningBalance: boolean;
  maxAccruableBalance: Decimal.Value | null;
}): Promise<boolean> {
  const { ent, periodKey, year, toOpeningBalance } = args;

  const balance = (await prismaAdmin.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: ent.employeeId,
        leaveTypeId: ent.leaveTypeId,
        year,
      },
    },
  })) as unknown as { id: string; earned: Decimal.Value; openingBalance: Decimal.Value } | null;

  const current = new Decimal(
    (toOpeningBalance ? balance?.openingBalance : balance?.earned) ?? 0,
  );

  // D-H: the cap WINS over quarter-day banding. Storing the capped amount can
  // leave a balance off a quarter boundary, and that is the intended trade.
  let delta = args.amount;
  if (!toOpeningBalance && args.maxAccruableBalance !== null) {
    const cap = new Decimal(args.maxAccruableBalance);
    const headroom = cap.minus(current);
    if (headroom.lessThanOrEqualTo(0)) delta = new Decimal(0);
    else if (delta.greaterThan(headroom)) delta = headroom;
  }

  const balanceRow =
    balance ??
    ((await prismaAdmin.leaveBalance.create({
      data: {
        tenantId: ent.tenantId,
        employeeId: ent.employeeId,
        leaveTypeId: ent.leaveTypeId,
        year,
      },
    })) as unknown as { id: string });

  // The unique constraint IS the idempotency check. Insert first; a violation
  // means this period was already granted.
  try {
    await prismaAdmin.leaveTransaction.create({
      data: {
        tenantId: ent.tenantId,
        employeeId: ent.employeeId,
        leaveTypeId: ent.leaveTypeId,
        leaveBalanceId: balanceRow.id,
        entitlementId: ent.id,
        periodKey,
        type: "ACCRUAL",
        amount: delta.toString(),
        approvalStatus: "APPROVED",
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }

  if (delta.isZero()) return true; // period marked as granted; nothing to add

  await prismaAdmin.leaveBalance.update({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: ent.employeeId,
        leaveTypeId: ent.leaveTypeId,
        year,
      },
    },
    data: toOpeningBalance
      ? { openingBalance: current.plus(delta).toString() }
      : { earned: current.plus(delta).toString() },
  });

  return true;
}
