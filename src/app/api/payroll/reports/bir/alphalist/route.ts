/**
 * GET /api/payroll/reports/bir/alphalist?year=YYYY[&employeeId=ID]
 *
 * Returns the BIR Annual Alphalist of Employees (RR 1-2014 Annex B-1 + B-2)
 * for the given calendar year.  Only FINALIZED PayrollBooks are included.
 * Optional `employeeId` parameter returns a single-employee Alphalist.
 *
 * Response: { data: AlphalistReport } — includes `datFileContent` for
 * BIR SRS/eBIRForms electronic submission.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import {
  buildAlphalistReport,
  type AlphalistEmployeeInput,
  type AlphalistSheetInput,
} from "@/lib/payroll/reports/bir-alphalist";

const querySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000, "year must be ≥ 2000")
    .max(2099, "year must be ≤ 2099"),
  employeeId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

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
      const sheets = await tx.payrollSheet.findMany({
        where: {
          tenantId: auth.tenantId,
          ...(employeeId ? { employeeId } : {}),
          payrollBook: {
            status: "FINALIZED",
            periodEnd: { gte: yearStart, lte: yearEnd },
          },
        },
        select: {
          employeeId: true,
          grossCompensationCents: true,
          mweExemptCompensationCents: true,
          nontaxableBasicCents: true,
          nontaxableCompensationCents: true,
          nontaxable13MonthAndBenefitsCents: true,
          grossTaxableIncomeCents: true,
          sssEeCents: true,
          philhealthEeCents: true,
          pagibigEeCents: true,
          withholdingTaxCents: true,
          taxClassificationSnapshot: true,
        },
      });

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: auth.tenantId },
        select: { name: true },
      });

      if (sheets.length === 0) {
        return buildAlphalistReport({
          year, tenantId: auth.tenantId, tenantName: tenant.name,
          employees: [],
        });
      }

      // Group by employeeId
      const byEmployee = new Map<string, AlphalistSheetInput[]>();
      const taxClassByEmployee = new Map<string, string>();

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
          isMwe: s.taxClassificationSnapshot === "MWE",
        });
        byEmployee.set(s.employeeId, bucket);
        taxClassByEmployee.set(s.employeeId, s.taxClassificationSnapshot);
      }

      const employees = await tx.employee.findMany({
        where: { id: { in: [...byEmployee.keys()] } },
        select: {
          id: true, employeeNumber: true, firstName: true,
          middleName: true, lastName: true, suffix: true,
          taxClassification: true,
        },
      });

      const employeeInputs: AlphalistEmployeeInput[] = employees.map((e) => ({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        suffix: e.suffix,
        // Use the sheet snapshot as the authoritative classification for the year
        taxClassification:
          (taxClassByEmployee.get(e.id) as AlphalistEmployeeInput["taxClassification"]) ??
          e.taxClassification,
        sheets: byEmployee.get(e.id) ?? [],
      }));

      return buildAlphalistReport({
        year, tenantId: auth.tenantId, tenantName: tenant.name,
        employees: employeeInputs,
      });
    });

    return ok({ data: report });
  } catch (e) {
    console.error("[bir/alphalist]", e);
    return err("Internal server error", 500);
  }
}
