/**
 * Deduction-cap safeguard ("no negative pay" policy).
 *
 * Enforces that an employee's monthly statutory + loan/recurring deductions do
 * not exceed `maxDeductionPctOfGross`% of monthly gross. Used as a preventive
 * guard when adding a loan — a new loan that would breach the cap is blocked.
 *
 * Everything is normalized to a MONTHLY basis: statutory contributions are
 * inherently monthly; per-payroll-period loan installments are scaled up by the
 * employee's pay frequency.
 */
import type { TenantTx } from "@/lib/with-tenant";
import { computeSSS, computePhilHealth, computePagibig } from "@/lib/statutory/compute";
import { resolveAllRules } from "@/lib/payroll/persist";

/** Approx payroll runs per month, by pay frequency (loans deduct each run). */
const PERIODS_PER_MONTH: Record<string, bigint> = {
  MONTHLY: 1n,
  SEMI_MONTHLY: 2n,
  BI_WEEKLY: 2n,
  WEEKLY: 4n,
  DAILY: 22n,
};

/** Monthly equivalent of a basic salary, by salary type. */
function monthlyEquivalentCents(
  basicSalaryCents: bigint,
  salaryType: string,
  workingDaysDenominator: number,
): bigint {
  switch (salaryType) {
    case "MONTHLY":
      return basicSalaryCents;
    case "DAILY":
      return (basicSalaryCents * BigInt(workingDaysDenominator)) / 12n;
    case "WEEKLY":
      return (basicSalaryCents * 52n) / 12n;
    default:
      return basicSalaryCents;
  }
}

export interface DeductionCapResult {
  withinCap: boolean;
  maxPct: number;
  monthlyGrossCents: bigint;
  monthlyStatutoryCents: bigint;
  /** Monthly loan obligation INCLUDING the proposed new installment. */
  monthlyLoanCents: bigint;
  /** maxPct% of monthly gross. */
  capCents: bigint;
  /** Per-payroll-period installment headroom still available BEFORE this loan. */
  remainingPerPeriodCents: bigint;
}

/**
 * Check whether adding a loan with `newInstallmentCents` per period keeps the
 * employee within the deduction cap. Returns null when there is no in-force
 * salary to evaluate against (caller should allow rather than block on missing
 * data). Statutory is best-effort: if rules aren't loaded it is treated as 0.
 */
export async function checkDeductionCap(
  tx: TenantTx,
  tenantId: string,
  employeeId: string,
  newInstallmentCents: bigint,
  maxPct: number,
  asOf: Date,
): Promise<DeductionCapResult | null> {
  const term = await tx.employmentTerm.findFirst({
    where: {
      tenantId,
      employeeId,
      basicSalaryCents: { not: null },
      effectiveDate: { lte: asOf },
    },
    orderBy: { effectiveDate: "desc" },
    select: { basicSalaryCents: true, salaryType: true },
  });
  const emp = await tx.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { payFrequency: true },
  });
  if (!term?.basicSalaryCents || !term.salaryType || !emp) return null;

  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { workingDaysDenominator: true },
  });

  const monthlyGrossCents = monthlyEquivalentCents(
    term.basicSalaryCents,
    term.salaryType,
    tenant.workingDaysDenominator,
  );

  // Monthly employee-share statutory at this gross (best-effort).
  let monthlyStatutoryCents = 0n;
  try {
    const rules = await resolveAllRules(tx, tenantId, asOf);
    monthlyStatutoryCents =
      computeSSS(rules.sss, monthlyGrossCents).employee +
      computePhilHealth(rules.philHealth, monthlyGrossCents).employee +
      computePagibig(rules.pagibig, monthlyGrossCents).employee;
  } catch {
    // Statutory rules not loaded for this date — fall back to loans-only cap.
    monthlyStatutoryCents = 0n;
  }

  const ppm = PERIODS_PER_MONTH[emp.payFrequency] ?? 2n;
  const activeLoans = await tx.loan.findMany({
    where: { tenantId, employeeId, status: "ACTIVE" },
    select: { installmentCents: true },
  });
  const existingPerPeriodCents = activeLoans.reduce((s, l) => s + l.installmentCents, 0n);
  const monthlyLoanCents = (existingPerPeriodCents + newInstallmentCents) * ppm;

  const capCents = (monthlyGrossCents * BigInt(maxPct)) / 100n;

  // Per-period installment room left before this loan: (cap − statutory) split
  // across the month, minus what existing loans already consume per period.
  const monthlyLoanRoom = capCents - monthlyStatutoryCents;
  const perPeriodRoom = monthlyLoanRoom > 0n ? monthlyLoanRoom / ppm : 0n;
  const remainingPerPeriodCents = perPeriodRoom - existingPerPeriodCents;

  return {
    withinCap: monthlyStatutoryCents + monthlyLoanCents <= capCents,
    maxPct,
    monthlyGrossCents,
    monthlyStatutoryCents,
    monthlyLoanCents,
    capCents,
    remainingPerPeriodCents: remainingPerPeriodCents > 0n ? remainingPerPeriodCents : 0n,
  };
}
