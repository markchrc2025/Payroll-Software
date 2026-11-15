/**
 * The parts of a payslip that come from outside the sheet itself: year-to-date
 * totals, the period's tardiness and the employee's leave balances.
 *
 * Shared by the employee's own payslip (GET /api/ess/payslips/[bookId]) and
 * the admin view of any employee's payslip (GET
 * /api/payroll/runs/[id]/payslips/[employeeId]) so both show the same figures.
 */
import type { TenantTx } from "@/lib/with-tenant";
import type { ComputePeriodInputSnapshot } from "@/lib/payroll/types";
import { centavosToJson } from "@/lib/money";

export interface PayslipExtras {
  ytd: {
    grossCents: string;
    wtaxCents: string;
    basicCents: string;
    released13thMonthCents: string;
    accrued13thMonthCents: string;
  };
  tardinessMinutes: number;
  leaveBalances: { code: string; name: string; available: string }[];
}

export async function loadPayslipExtras(
  tx: TenantTx,
  args: {
    tenantId: string;
    employeeId: string;
    periodEnd: Date;
    periodInputSnapshot: unknown;
  },
): Promise<PayslipExtras> {
  // Calendar-year boundaries for YTD
  const periodYear = args.periodEnd.getFullYear();
  const yearStart = new Date(`${periodYear}-01-01T00:00:00.000Z`);

  const [ytdSheets, leaveBalances] = await Promise.all([
    // All finalized sheets in the same calendar year up to and including this period
    tx.payrollSheet.findMany({
      where: {
        tenantId: args.tenantId,
        employeeId: args.employeeId,
        payrollBook: {
          status: "FINALIZED",
          periodEnd: { gte: yearStart, lte: args.periodEnd },
        },
      },
      select: {
        grossCompensationCents: true,
        withholdingTaxCents: true,
        basePayCents: true,
        nontaxable13MonthAndBenefitsCents: true,
      },
    }),
    // Leave balances for the period's year (SL / VL)
    tx.leaveBalance.findMany({
      where: { employeeId: args.employeeId, year: periodYear },
      select: {
        earned: true,
        used: true,
        forfeited: true,
        openingBalance: true,
        leaveType: { select: { code: true, name: true } },
      },
    }),
  ]);

  let ytdGross = BigInt(0);
  let ytdWtax = BigInt(0);
  let ytdBasic = BigInt(0);
  let ytd13Month = BigInt(0);
  for (const s of ytdSheets) {
    ytdGross += s.grossCompensationCents;
    ytdWtax += s.withholdingTaxCents;
    ytdBasic += s.basePayCents;
    ytd13Month += s.nontaxable13MonthAndBenefitsCents;
  }

  // Accrued 13th month = ytdBasic / 12 (DOLE formula, regardless of how much has been released)
  const accrued13thMonth = ytdBasic / BigInt(12);

  // Tardiness from periodInputSnapshot
  const snap = args.periodInputSnapshot as ComputePeriodInputSnapshot | null;
  const tardinessMinutes = snap?.lateUndertimeMinutes ?? 0;

  return {
    ytd: {
      grossCents: centavosToJson(ytdGross)!,
      wtaxCents: centavosToJson(ytdWtax)!,
      basicCents: centavosToJson(ytdBasic)!,
      released13thMonthCents: centavosToJson(ytd13Month)!,
      accrued13thMonthCents: centavosToJson(accrued13thMonth)!,
    },
    tardinessMinutes,
    leaveBalances: leaveBalances.map((b) => ({
      code: b.leaveType.code,
      name: b.leaveType.name,
      available: (
        parseFloat(String(b.earned)) -
        parseFloat(String(b.used)) -
        parseFloat(String(b.forfeited))
      ).toFixed(2),
    })),
  };
}
