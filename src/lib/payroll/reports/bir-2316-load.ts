/**
 * BIR 2316 data for a year, from FINALIZED payroll (moved out of
 * /api/payroll/reports/bir/2316 unchanged, PAY-199) so HR and the employee's
 * own ESS download read the same certificate.
 */
import type { Prisma } from "@prisma/client";
import {
  buildBir2316Report,
  type Bir2316EmployeeInput,
  type Bir2316SheetInput,
} from "@/lib/payroll/reports/bir-2316";
import { BIR_SHEET_SELECT, factsFromSheet, splitSheet } from "@/lib/payroll/reports/bir-comp";
import {
  BIR_EMPLOYEE_SELECT, loadAnnualTaxDue, loadEmployeeTins, loadMinimumWages,
  loadWithholdingAgent, personOf,
} from "@/lib/payroll/reports/bir-data";
import {
  loadYtdOpeningsByEmployee,
  openingAsReportSheet,
  type YtdOpening,
} from "@/lib/payroll/ytd-openings";

type Tx = Prisma.TransactionClient;

export async function loadBir2316Report(tx: Tx, tenantId: string, year: number, employeeId?: string) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    // 1. Fetch all FINALIZED sheets for the year.
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: tenantId,
        ...(employeeId ? { employeeId } : {}),
        payrollBook: {
          status: "FINALIZED",
          periodEnd: { gte: yearStart, lte: yearEnd },
        },
      },
      select: { ...BIR_SHEET_SELECT, workingDaysDenominatorSnapshot: true },
    });
    const daysPerYear = new Map<string, number>();
    for (const s of sheets) daysPerYear.set(s.employeeId, s.workingDaysDenominatorSnapshot);

    // 2. Group by employeeId.
    const byEmployee = new Map<string, Bir2316SheetInput[]>();
    for (const s of sheets) {
      const bucket = byEmployee.get(s.employeeId) ?? [];
      bucket.push({
        grossCompensationCents: s.grossCompensationCents,
        mweExemptCompensationCents: s.mweExemptCompensationCents,
        nontaxableBasicCents: s.nontaxableBasicCents,
        nontaxableCompensationCents: s.nontaxableCompensationCents,
        nontaxable13MonthAndBenefitsCents: s.nontaxable13MonthAndBenefitsCents,
        grossTaxableIncomeCents: s.grossTaxableIncomeCents,
        sssEeCents: s.sssEeCents,
        philhealthEeCents: s.philhealthEeCents,
        pagibigEeCents: s.pagibigEeCents,
        withholdingTaxCents: s.withholdingTaxCents,
        comp: splitSheet(factsFromSheet(s)),
      });
      byEmployee.set(s.employeeId, bucket);
    }

    // PAY-144: openings put employees paid only before Sentire on the list too.
    const openings = await loadYtdOpeningsByEmployee(
      tx,
      tenantId,
      year,
      employeeId ? [employeeId] : undefined,
    );
    const employeeIds = [...new Set([...byEmployee.keys(), ...openings.keys()])];
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    const employer = await loadWithholdingAgent(tx, tenantId);
    const taxDue = await loadAnnualTaxDue(tx, tenantId, year);

    if (employeeIds.length === 0) {
      return buildBir2316Report({
        year,
        tenantId: tenantId,
        tenantName: tenant.name,
        employer,
        taxDue,
        employees: [],
      });
    }

    // 3. Load employee details.
    const employees = await tx.employee.findMany({
      where: { id: { in: employeeIds } },
      select: BIR_EMPLOYEE_SELECT,
    });
    const tins = await loadEmployeeTins(tx, tenantId, employeeIds);
    const minimumWages = await loadMinimumWages(tx, tenantId, year);

    // 4. Fetch year-end annualization data for each employee (if run).
    const yearEndAnnSheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: tenantId,
        ...(employeeId ? { employeeId } : {}),
        NOT: { annualizationData: { equals: "JsonNull" } },
        payrollBook: {
          status: "FINALIZED",
          runType: "YEAR_END",
          periodEnd: { gte: yearStart, lte: yearEnd },
        },
      },
      select: {
        employeeId: true,
        annualizationData: true,
      },
    });
    const annByEmployee = new Map<string, unknown>(
      yearEndAnnSheets.map((s) => [s.employeeId, s.annualizationData]),
    );

    const employeeInputs: Bir2316EmployeeInput[] = employees.map((e) => ({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      suffix: e.suffix,
      taxClassification: e.taxClassification,
      sheets: byEmployee.get(e.id) ?? [],
      person: personOf(e, year, tins.get(e.id) ?? null, minimumWages, daysPerYear.get(e.id) ?? null),
      ...ytdOpeningInputs(openings.get(e.id) ?? []),
    }));

    const report = buildBir2316Report({
      year,
      tenantId: tenantId,
      tenantName: tenant.name,
      employer,
      taxDue,
      employees: employeeInputs,
    });

    // Attach annualizationData to each certificate where available.
    const certificates = report.certificates.map((cert) => ({
      ...cert,
      annualizationData: annByEmployee.get(cert.employeeId) ?? null,
    }));

    return { ...report, certificates };
}

function ytdOpeningInputs(
  list: YtdOpening[],
): Pick<Bir2316EmployeeInput, "priorPayrollOpening" | "previousEmployer"> {
  const prior = list.find((o) => o.source === "PRIOR_PAYROLL");
  const prev = list.find((o) => o.source === "PREVIOUS_EMPLOYER");
  return {
    priorPayrollOpening: prior ? openingAsReportSheet(prior) : undefined,
    previousEmployer: prev
      ? {
          name: prev.previousEmployerName ?? "",
          tin: prev.previousEmployerTin,
          taxableCompensationCents: prev.taxableCompensationCents,
          withholdingTaxCents: prev.withholdingTaxCents,
        }
      : null,
  };
}
