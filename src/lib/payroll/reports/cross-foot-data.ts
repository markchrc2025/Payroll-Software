/**
 * PAY-70: the payslip side of each cross-foot check, read straight from the
 * finalized payslips by database totals. It shares no code with the report
 * builders it is compared against, so a check that ties out means two
 * separate routes reached the same figure.
 */
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { payableSheets } from "@/lib/payroll/bank-files/types";
import { loadYtdOpeningsByEmployee, openingAsReportSheet } from "@/lib/payroll/ytd-openings";
import type { BirFormView } from "./bir-form";
import {
  alphalistChecks, bir2316Checks, runCrossFoot,
  type CrossFootCheck, type MonthPayslipTotals, type PayslipFigures, type RegisterTotals, type YearFigures,
} from "./cross-foot";

type Tx = Prisma.TransactionClient;
const z = (n: bigint | null | undefined) => n ?? 0n;

export async function monthPayslipTotals(tenantId: string, year: number, month: number): Promise<MonthPayslipTotals> {
  const sums = await withTenant(tenantId, (tx) =>
    tx.payrollSheet.aggregate({
      where: {
        tenantId,
        payrollBook: {
          status: "FINALIZED",
          periodEnd: { gte: new Date(Date.UTC(year, month - 1, 1)), lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) },
        },
      },
      _sum: {
        sssEeCents: true, sssErCents: true, sssEcCents: true,
        philhealthEeCents: true, philhealthErCents: true,
        pagibigEeCents: true, pagibigErCents: true,
        withholdingTaxCents: true,
      },
    }),
  );
  const s = sums._sum;
  return {
    sssCents: z(s.sssEeCents) + z(s.sssErCents) + z(s.sssEcCents),
    philhealthCents: z(s.philhealthEeCents) + z(s.philhealthErCents),
    pagibigCents: z(s.pagibigEeCents) + z(s.pagibigErCents),
    withholdingTaxCents: z(s.withholdingTaxCents),
  };
}

/** What each employee's payslips of the year add up to, with any opening for this employer. */
export async function yearPayslipFigures(tx: Tx, tenantId: string, year: number, employeeId?: string): Promise<Map<string, YearFigures>> {
  const groups = await tx.payrollSheet.groupBy({
    by: ["employeeId"],
    where: {
      tenantId,
      ...(employeeId ? { employeeId } : {}),
      payrollBook: {
        status: "FINALIZED",
        periodEnd: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) },
      },
    },
    _sum: { grossCompensationCents: true, grossTaxableIncomeCents: true, withholdingTaxCents: true },
  });
  const out = new Map<string, YearFigures>();
  for (const g of groups) {
    const gross = z(g._sum.grossCompensationCents);
    const taxable = z(g._sum.grossTaxableIncomeCents);
    out.set(g.employeeId, {
      grossCents: gross,
      taxableCents: taxable,
      withholdingTaxCents: z(g._sum.withholdingTaxCents),
    });
  }
  const openings = await loadYtdOpeningsByEmployee(tx, tenantId, year, employeeId ? [employeeId] : undefined);
  for (const [id, list] of openings) {
    const prior = list.find((o) => o.source === "PRIOR_PAYROLL");
    if (!prior) continue;
    const o = openingAsReportSheet(prior);
    const cur = out.get(id) ?? { grossCents: 0n, taxableCents: 0n, withholdingTaxCents: 0n };
    out.set(id, {
      grossCents: cur.grossCents + o.grossCompensationCents,
      taxableCents: cur.taxableCents + o.grossTaxableIncomeCents,
      withholdingTaxCents: cur.withholdingTaxCents + o.withholdingTaxCents,
    });
  }
  return out;
}

const item = (form: BirFormView, no: string): bigint => {
  for (const s of form.sections) for (const l of s.lines) if (l.no === no) return BigInt(l.value ?? "0");
  return 0n;
};

/** What each 2316 says: Items 19, 21 and 25A. */
export function certificateFigures(certs: { employeeId: string; form: BirFormView }[]): Map<string, YearFigures> {
  return new Map(
    certs.map((c) => [
      c.employeeId,
      { grossCents: item(c.form, "19"), taxableCents: item(c.form, "21"), withholdingTaxCents: item(c.form, "25A") },
    ]),
  );
}

export async function crossFoot2316(
  tenantId: string,
  year: number,
  certs: { employeeId: string; form: BirFormView }[],
  employeeId?: string,
): Promise<CrossFootCheck[]> {
  const payslips = await withTenant(tenantId, (tx) => yearPayslipFigures(tx, tenantId, year, employeeId));
  return bir2316Checks(certificateFigures(certs), payslips);
}

/** The alphalist's totals (both schedules) against all the 2316s. */
export function crossFootAlphalist(form: BirFormView, certs: { employeeId: string; form: BirFormView }[]): CrossFootCheck[] {
  const total = (code1: string, code2: string) => {
    let sum = 0n;
    form.schedules.forEach((sch, i) => {
      if (i === 0 || !sch.totals) return; // Part II is not an alphalist schedule
      const at = sch.columns.findIndex((c) => c.no === (i === 1 ? code1 : code2));
      if (at >= 0) sum += BigInt(sch.totals[at] ?? "0");
    });
    return sum;
  };
  const figures = [...certificateFigures(certs).values()];
  const sum = (k: keyof YearFigures) => figures.reduce((t, v) => t + v[k], 0n);
  // Column 18 includes tax withheld by a previous employer (15a); the 2316's
  // Item 26 does too, so compare like with like.
  const item26 = certs.reduce((t, c) => t + item(c.form, "26"), 0n);
  return alphalistChecks(
    { grossCents: total("7a", "7a"), taxableCents: total("7j", "7r"), withholdingTaxCents: total("18", "18") },
    { grossCents: sum("grossCents"), taxableCents: sum("taxableCents"), withholdingTaxCents: item26 },
  );
}

/** Checks (1) to (3) for one run, with the register's totals row. */
export async function crossFootRun(tenantId: string, bookId: string): Promise<{ register: RegisterTotals; checks: CrossFootCheck[]; status: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const book = await tx.payrollBook.findFirst({ where: { id: bookId, tenantId }, select: { status: true } });
    if (!book) return null;
    const rows = await tx.payrollSheet.findMany({
      where: { tenantId, payrollBookId: bookId },
      select: {
        employeeId: true, grossCompensationCents: true, sssEeCents: true, philhealthEeCents: true, pagibigEeCents: true,
        withholdingTaxCents: true, loanDeductionsCents: true, adjustmentDeductionsCents: true,
        nontaxableAdditionsCents: true, netPayCents: true,
      },
    });
    const people = await tx.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
      select: { id: true, employeeNumber: true, lastName: true, firstName: true },
    });
    const label = new Map(people.map((p) => [p.id, `${p.lastName}, ${p.firstName} (${p.employeeNumber})`]));
    const sheets: PayslipFigures[] = rows.map((r) => ({ ...r, employeeLabel: label.get(r.employeeId) }));

    // The register's totals row, added by the database.
    const sums = await tx.payrollSheet.aggregate({
      where: { tenantId, payrollBookId: bookId },
      _count: true,
      _sum: {
        grossCompensationCents: true, sssEeCents: true, philhealthEeCents: true, pagibigEeCents: true,
        withholdingTaxCents: true, loanDeductionsCents: true, adjustmentDeductionsCents: true,
        nontaxableAdditionsCents: true, netPayCents: true,
      },
    });
    const s = sums._sum;
    const register: RegisterTotals = {
      payslips: sums._count,
      grossCents: z(s.grossCompensationCents), sssEeCents: z(s.sssEeCents), philhealthEeCents: z(s.philhealthEeCents),
      pagibigEeCents: z(s.pagibigEeCents), withholdingTaxCents: z(s.withholdingTaxCents),
      loanDeductionsCents: z(s.loanDeductionsCents), otherDeductionsCents: z(s.adjustmentDeductionsCents),
      additionsCents: z(s.nontaxableAdditionsCents), netPayCents: z(s.netPayCents),
    };
    // The bank file exists once the run is finalized; its rows are the payable payslips.
    const bankFileTotalCents =
      book.status === "FINALIZED" ? payableSheets(rows).reduce((t, r) => t + r.netPayCents, 0n) : null;
    return { register, checks: runCrossFoot({ sheets, register, bankFileTotalCents }), status: book.status };
  });
}
