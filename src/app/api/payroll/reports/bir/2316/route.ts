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
        },
      });

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
        });
        byEmployee.set(s.employeeId, bucket);
      }

      const employeeIds = [...byEmployee.keys()];
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: auth.tenantId },
        select: { name: true },
      });

      if (employeeIds.length === 0) {
        return buildBir2316Report({
          year,
          tenantId: auth.tenantId,
          tenantName: tenant.name,
          employees: [],
        });
      }

      // 3. Load employee details.
      const employees = await tx.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          suffix: true,
          taxClassification: true,
        },
      });

      const employeeInputs: Bir2316EmployeeInput[] = employees.map((e) => ({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        suffix: e.suffix,
        taxClassification: e.taxClassification,
        sheets: byEmployee.get(e.id) ?? [],
      }));

      return buildBir2316Report({
        year,
        tenantId: auth.tenantId,
        tenantName: tenant.name,
        employees: employeeInputs,
      });
    });

    // Single-employee response: return the certificate directly (or 404).
    if (employeeId) {
      const cert = report.certificates.find(
        (c) => c.employeeId === employeeId,
      );
      if (!cert) return notFound("No payroll data found for this employee in the requested year");
      return ok(cert);
    }

    return ok(report);
  } catch (e) {
    console.error("[bir/2316]", e);
    return err("Internal server error", 500);
  }
}
