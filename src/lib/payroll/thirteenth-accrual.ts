/**
 * PAY-152 (Mark, 16 Nov 2026 21:01, HR.my review D3b follow-up): every
 * payroll run also works out the 13th month on the side as an accrued
 * expense, so Finance can see at any time how much 13th month will be paid.
 *
 * Each finalized REGULAR run stores, on each payslip, the 13th-month base it
 * earned (the same base the 13th month itself uses: basic pay, less lates and
 * undertime unless the company opted out (PAY-198), plus the components
 * marked "13th-Month Pay basis" when the company counts allowances (PAY-60))
 * and the accrual, one twelfth of it. Recorded only, never paid.
 *
 * The report: accrued to date (this year's runs and the PAY-144 opening,
 * divided by 12 once, so it is exact), the projected payout (accrued to date
 * plus the monthly basic on the latest payslip for the rest of the year), what
 * was paid, and the difference, per employee and for the company, with the
 * journal Finance would post: each month Dr 13th Month Pay Expense, Cr Accrued
 * 13th Month Pay; on payout Dr Accrued 13th Month Pay, Cr Cash.
 */
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaValues } from "@prisma/client";
import { deriveSalaryRates } from "./rates";

type Tx = Prisma.TransactionClient;

export interface ThirteenthPolicy {
  basis: "STRICT_DOLE" | "INCLUDE_ALLOWANCES";
  deductLates: boolean;
  /** Pay component ids counted in the base (INCLUDE_ALLOWANCES only). */
  counted: Set<string>;
}

export async function loadThirteenthPolicy(tx: Tx, tenantId: string): Promise<ThirteenthPolicy> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { thirteenthMonthBasis: true, thirteenthMonthDeductLates: true } });
  const basis = (t?.thirteenthMonthBasis ?? "STRICT_DOLE") as ThirteenthPolicy["basis"];
  const counted = basis === "INCLUDE_ALLOWANCES"
    ? new Set((await tx.payComponent.findMany({
        where: { tenantId, includeIn13thMonth: true, isBonus: false, kind: { notIn: ["DEDUCTION", "REIMBURSEMENT"] } },
        select: { id: true },
      })).map((c) => c.id))
    : new Set<string>();
  return { basis, deductLates: t?.thirteenthMonthDeductLates ?? true, counted };
}

/** One payslip's contribution to the 13th-month base, the way the 13th month counts it. */
export function thirteenthBasisOfSheet(
  sheet: { basePayCents: bigint; lateUndertimeDeductionCents: bigint; payComponentsApplied: unknown },
  policy: ThirteenthPolicy,
): bigint {
  const applied = (Array.isArray(sheet.payComponentsApplied) ? sheet.payComponentsApplied : []) as { id?: string; amountCents?: string }[];
  const allowances = applied.reduce((t, a) => (a?.id && policy.counted.has(a.id) ? t + BigInt(a.amountCents ?? "0") : t), 0n);
  const lates = policy.deductLates ? sheet.lateUndertimeDeductionCents : 0n;
  return sheet.basePayCents - lates + allowances;
}

/** Writes the accrual onto each payslip of a REGULAR run; call inside the finalize transaction. */
export async function recordThirteenthAccrual(tx: Tx, tenantId: string, bookId: string): Promise<number> {
  const policy = await loadThirteenthPolicy(tx, tenantId);
  const sheets = await tx.payrollSheet.findMany({
    where: { payrollBookId: bookId },
    select: { id: true, basePayCents: true, lateUndertimeDeductionCents: true, payComponentsApplied: true },
  });
  for (const s of sheets) {
    const basis = thirteenthBasisOfSheet(s, policy);
    await tx.payrollSheet.update({ where: { id: s.id }, data: { thirteenthAccrualBasisCents: basis, thirteenthAccrualCents: basis / 12n } });
  }
  return sheets.length;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface AccrualSheetRow {
  employeeId: string;
  periodEnd: Date;
  basisCents: bigint;
  accrualCents: bigint;
  /** Latest payslip's pay basis, for the projection. */
  basicSalaryCentsSnapshot: bigint;
  salaryTypeSnapshot: "MONTHLY" | "DAILY" | "WEEKLY";
  workingDaysDenominatorSnapshot: number;
}

export interface AccrualEmployee {
  employeeId: string;
  employeeNumber: string;
  name: string;
  separated: boolean;
  openingBasicCents: bigint;
  openingPaidCents: bigint;
}

export interface AccrualPayout { employeeId: string; periodEnd: Date; paidCents: bigint }

export interface ThirteenthAccrualRow {
  employeeId: string;
  employeeNumber: string;
  name: string;
  runs: number;
  basisFromRunsCents: string;
  basisFromOpeningCents: string;
  accruedToDateCents: string;
  monthlyBasicCents: string;
  projectedPayoutCents: string;
  paidCents: string;
  /** Paid less accrued to date, once something was paid; null before. */
  differenceCents: string | null;
}

export interface ThirteenthAccrualReport {
  year: number;
  /** The last day the accrual covers: the latest finalized regular run's period end. */
  asOf: string | null;
  /** Months of the year after asOf (1.5 after a run to 15 Nov). */
  monthsLeft: number;
  rows: ThirteenthAccrualRow[];
  totals: Omit<ThirteenthAccrualRow, "employeeId" | "employeeNumber" | "name" | "runs" | "monthlyBasicCents" | "differenceCents"> & { differenceCents: string };
  journal: { month: number; accrualCents: string; payoutCents: string }[];
  notes: string[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildThirteenthAccrualReport(input: {
  year: number;
  employees: AccrualEmployee[];
  sheets: AccrualSheetRow[];
  payouts: AccrualPayout[];
}): ThirteenthAccrualReport {
  const { year } = input;
  const asOfDate = input.sheets.reduce<Date | null>((m, s) => (!m || s.periodEnd > m ? s.periodEnd : m), null);
  // Months left after asOf, as a fraction: whole months after its month, plus
  // the part of its month still to come (a run to 15 Nov leaves 1.5 months).
  // Kept as numerator over 12 x days-in-that-month so the projection stays exact.
  const m0 = asOfDate ? asOfDate.getUTCMonth() : -1;
  const dim = asOfDate ? new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate() : 1;
  const leftNum = asOfDate ? BigInt((11 - m0) * dim + (dim - asOfDate.getUTCDate())) : 12n;
  const leftDen = asOfDate ? BigInt(12 * dim) : 12n;
  const monthsLeft = Math.round((Number(leftNum) * 12 / Number(leftDen)) * 100) / 100;

  const byEmp = new Map<string, AccrualSheetRow[]>();
  for (const s of input.sheets) (byEmp.get(s.employeeId) ?? byEmp.set(s.employeeId, []).get(s.employeeId)!).push(s);
  const paidBy = new Map<string, bigint>();
  for (const p of input.payouts) paidBy.set(p.employeeId, (paidBy.get(p.employeeId) ?? 0n) + p.paidCents);

  const rows: ThirteenthAccrualRow[] = [];
  const sum = { runs: 0n, opening: 0n, accrued: 0n, projected: 0n, paid: 0n };
  for (const e of input.employees) {
    const mine = (byEmp.get(e.employeeId) ?? []).sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
    const paid = (paidBy.get(e.employeeId) ?? 0n) + e.openingPaidCents;
    if (!mine.length && e.openingBasicCents === 0n && paid === 0n) continue;
    const fromRuns = mine.reduce((t, s) => t + s.basisCents, 0n);
    const accrued = (fromRuns + e.openingBasicCents) / 12n;
    const last = mine[mine.length - 1];
    const monthly = last
      ? deriveSalaryRates({ basicSalaryCents: last.basicSalaryCentsSnapshot, salaryType: last.salaryTypeSnapshot, divisor: last.workingDaysDenominatorSnapshot, hoursPerDay: 8 }).monthlyEquivalentCents
      : 0n;
    const rest = e.separated || !last ? 0n : (monthly * leftNum) / leftDen;
    const projected = accrued + rest;
    rows.push({
      employeeId: e.employeeId,
      employeeNumber: e.employeeNumber,
      name: e.name,
      runs: mine.length,
      basisFromRunsCents: fromRuns.toString(),
      basisFromOpeningCents: e.openingBasicCents.toString(),
      accruedToDateCents: accrued.toString(),
      monthlyBasicCents: monthly.toString(),
      projectedPayoutCents: projected.toString(),
      paidCents: paid.toString(),
      differenceCents: paid > 0n ? (paid - accrued).toString() : null,
    });
    sum.runs += fromRuns; sum.opening += e.openingBasicCents; sum.accrued += accrued; sum.projected += projected; sum.paid += paid;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const journal = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, accrual: 0n, payout: 0n }));
  for (const s of input.sheets) journal[s.periodEnd.getUTCMonth()]!.accrual += s.accrualCents;
  for (const p of input.payouts) journal[p.periodEnd.getUTCMonth()]!.payout += p.paidCents;

  const notes = [
    "Accrued to date is this year's 13th-month base (finalized regular runs and pay before Sentire) divided by 12. The base is the one the 13th month itself uses.",
    "Projected payout adds one twelfth of the monthly basic on the employee's latest payslip for each month left in the year (a part month counts by its days). Employees who have left get no projection.",
    "Journal: each month Dr 13th Month Pay Expense, Cr Accrued 13th Month Pay (the accrual of that month's runs); on payout Dr Accrued 13th Month Pay, Cr Cash.",
    "14th month and other bonuses are not accrued: their amounts are set when they are given.",
  ];
  if (input.employees.some((e) => e.openingPaidCents > 0n)) notes.push("Paid includes 13th month paid before Sentire (year-to-date openings).");

  return {
    year,
    asOf: asOfDate ? iso(asOfDate) : null,
    monthsLeft,
    rows,
    totals: {
      basisFromRunsCents: sum.runs.toString(),
      basisFromOpeningCents: sum.opening.toString(),
      accruedToDateCents: sum.accrued.toString(),
      projectedPayoutCents: sum.projected.toString(),
      paidCents: sum.paid.toString(),
      differenceCents: (sum.paid - sum.accrued).toString(),
    },
    journal: journal.map((j) => ({ month: j.month, accrualCents: j.accrual.toString(), payoutCents: j.payout.toString() })),
    notes,
  };
}

export async function loadThirteenthAccrualReport(tx: Tx, tenantId: string, year: number): Promise<ThirteenthAccrualReport> {
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
  const policy = await loadThirteenthPolicy(tx, tenantId);
  const [regular, paid, finalPay, openings] = await Promise.all([
    tx.payrollSheet.findMany({
      where: { tenantId, payrollBook: { status: "FINALIZED", runType: "REGULAR", periodEnd: { gte: yearStart, lte: yearEnd } } },
      select: {
        employeeId: true, basePayCents: true, lateUndertimeDeductionCents: true, payComponentsApplied: true,
        thirteenthAccrualBasisCents: true, thirteenthAccrualCents: true,
        basicSalaryCentsSnapshot: true, salaryTypeSnapshot: true, workingDaysDenominatorSnapshot: true,
        payrollBook: { select: { periodEnd: true } },
      },
    }),
    tx.payrollSheet.findMany({
      where: {
        tenantId, thirteenthMonthBreakdown: { not: PrismaValues.DbNull },
        payrollBook: { status: "FINALIZED", runType: { in: ["REGULAR", "YEAR_END"] }, periodEnd: { gte: yearStart, lte: yearEnd } },
      },
      select: { employeeId: true, thirteenthMonthBreakdown: true, payrollBook: { select: { periodEnd: true } } },
    }),
    // The prorated 13th month paid in a final pay run.
    tx.payrollSheet.findMany({
      where: { tenantId, finalPayBreakdown: { not: PrismaValues.DbNull }, payrollBook: { status: "FINALIZED", runType: "FINAL_PAY", periodEnd: { gte: yearStart, lte: yearEnd } } },
      select: { employeeId: true, finalPayBreakdown: true, payrollBook: { select: { periodEnd: true } } },
    }),
    tx.employeeYtdOpening.findMany({ where: { tenantId, year, source: "PRIOR_PAYROLL" }, select: { employeeId: true, basicPayEarnedCents: true, thirteenthMonthPaidCents: true } }),
  ]);
  const ids = [...new Set([...regular, ...paid, ...finalPay, ...openings].map((x) => x.employeeId))];
  const people = await tx.employee.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, employmentStatus: true },
  });
  const open = new Map(openings.map((o) => [o.employeeId, o]));
  return buildThirteenthAccrualReport({
    year,
    employees: people.map((p) => ({
      employeeId: p.id,
      employeeNumber: p.employeeNumber,
      name: `${p.lastName}, ${p.firstName}`,
      separated: ["RESIGNED", "TERMINATED", "RETIRED"].includes(p.employmentStatus),
      openingBasicCents: open.get(p.id)?.basicPayEarnedCents ?? 0n,
      openingPaidCents: open.get(p.id)?.thirteenthMonthPaidCents ?? 0n,
    })),
    sheets: regular.map((s) => {
      // Payslips finalized before PAY-152 have no stored accrual: work it out the same way.
      const basis = s.thirteenthAccrualBasisCents ?? thirteenthBasisOfSheet(s, policy);
      return {
        employeeId: s.employeeId,
        periodEnd: s.payrollBook.periodEnd,
        basisCents: basis,
        accrualCents: s.thirteenthAccrualCents ?? basis / 12n,
        basicSalaryCentsSnapshot: s.basicSalaryCentsSnapshot,
        salaryTypeSnapshot: s.salaryTypeSnapshot as AccrualSheetRow["salaryTypeSnapshot"],
        workingDaysDenominatorSnapshot: s.workingDaysDenominatorSnapshot,
      };
    }),
    payouts: [
      ...paid.map((s) => ({
        employeeId: s.employeeId,
        periodEnd: s.payrollBook.periodEnd,
        paidCents: BigInt(((s.thirteenthMonthBreakdown ?? {}) as { dueCents?: string }).dueCents ?? "0"),
      })),
      ...finalPay.map((s) => ({
        employeeId: s.employeeId,
        periodEnd: s.payrollBook.periodEnd,
        paidCents: BigInt(((s.finalPayBreakdown ?? {}) as { proratedThirteenthMonthCents?: string }).proratedThirteenthMonthCents ?? "0"),
      })),
    ],
  });
}
