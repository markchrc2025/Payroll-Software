/**
 * GET /api/payroll/reports/bir/2316?year=YYYY[&employeeId=ID]
 *
 * Returns BIR Form 2316 certificates for all employees (or a single
 * employee when `employeeId` is supplied) for the given calendar year.
 *
 * All FINALIZED PayrollBooks whose `periodEnd` falls within the year are
 * included — REGULAR, YEAR_END, OFF_CYCLE, and FINAL_PAY.
 *
 * Response (all employees):  { data: Bir2316Report }
 * Response (single employee): { data: Bir2316Certificate }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
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
import { forbidUnless } from "@/lib/authz/route-permission";
import {
  loadYtdOpeningsByEmployee,
  openingAsReportSheet,
  type YtdOpening,
} from "@/lib/payroll/ytd-openings";
import { crossFoot2316 } from "@/lib/payroll/reports/cross-foot-data";

const querySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000, "year must be ≥ 2000")
    .max(2099, "year must be ≤ 2099"),
  employeeId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["REPORTS", "READ"]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year"),
    employeeId: searchParams.get("employeeId") ?? undefined,
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  }
  const { year, employeeId } = parsed.data;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  try {
    const report = await withTenant(auth.tenantId, async (tx) => {
      // 1. Fetch all FINALIZED sheets for the year.
      const sheets = await tx.payrollSheet.findMany({
        where: {
          tenantId: auth.tenantId,
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
        auth.tenantId,
        year,
        employeeId ? [employeeId] : undefined,
      );
      const employeeIds = [...new Set([...byEmployee.keys(), ...openings.keys()])];
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: auth.tenantId },
        select: { name: true },
      });
      const employer = await loadWithholdingAgent(tx, auth.tenantId);
      const taxDue = await loadAnnualTaxDue(tx, auth.tenantId, year);

      if (employeeIds.length === 0) {
        return buildBir2316Report({
          year,
          tenantId: auth.tenantId,
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
      const tins = await loadEmployeeTins(tx, auth.tenantId, employeeIds);
      const minimumWages = await loadMinimumWages(tx, auth.tenantId, year);

      // 4. Fetch year-end annualization data for each employee (if run).
      const yearEndAnnSheets = await tx.payrollSheet.findMany({
        where: {
          tenantId: auth.tenantId,
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
        tenantId: auth.tenantId,
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
    });

    // Single-employee response: return the certificate directly (or 404).
    if (employeeId) {
      const cert = report.certificates.find(
        (c) => c.employeeId === employeeId,
      );
      if (!cert) return notFound("No payroll data found for this employee in the requested year");
      return ok({ ...cert, crossFoot: await crossFoot2316(auth.tenantId, year, [cert], employeeId) });
    }

    // PAY-70: each certificate against that employee's payslips for the year.
    return ok({ ...report, crossFoot: await crossFoot2316(auth.tenantId, year, report.certificates) });
  } catch (e) {
    console.error("[bir/2316]", e);
    return err("Internal server error", 500);
  }
}

/** PAY-144: the 2316 inputs that come from an employee's year-to-date openings. */
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
