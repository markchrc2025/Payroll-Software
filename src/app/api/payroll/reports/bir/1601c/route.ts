/**
 * GET /api/payroll/reports/bir/1601c?year=YYYY&month=M
 *
 * Returns the BIR 1601-C Monthly Remittance Return data for the given
 * calendar year and month.  Only FINALIZED PayrollBooks whose `periodEnd`
 * falls within the requested month are included.  Includes REGULAR,
 * YEAR_END, OFF_CYCLE, and FINAL_PAY run types — any finalized compensation
 * that generated withheld tax during that month.
 *
 * Response: { data: Bir1601cReport }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import {
  buildBir1601cReport,
  type Bir1601cEmployeeInput,
  type Bir1601cSheetInput,
} from "@/lib/payroll/reports/bir-1601c";
import { BIR_SHEET_SELECT, factsFromSheet, splitSheet } from "@/lib/payroll/reports/bir-comp";
import { loadEmployeeTins, loadWithholdingAgent } from "@/lib/payroll/reports/bir-data";
import { forbidUnless } from "@/lib/authz/route-permission";

const querySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000, "year must be ≥ 2000")
    .max(2099, "year must be ≤ 2099"),
  month: z.coerce
    .number()
    .int()
    .min(1, "month must be between 1 and 12")
    .max(12, "month must be between 1 and 12"),
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
    month: searchParams.get("month"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  }
  const { year, month } = parsed.data;

  // Date range: first moment of the month to the last moment (UTC).
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  try {
    const report = await withTenant(auth.tenantId, async (tx) => {
      // 1. Fetch all FINALIZED sheets for the month via the book's periodEnd.
      const sheets = await tx.payrollSheet.findMany({
        where: {
          tenantId: auth.tenantId,
          payrollBook: {
            status: "FINALIZED",
            periodEnd: { gte: rangeStart, lte: rangeEnd },
          },
        },
        select: BIR_SHEET_SELECT,
      });
      const agent = await loadWithholdingAgent(tx, auth.tenantId);

      if (sheets.length === 0) {
        // No finalized data for the period — return empty report.
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: auth.tenantId },
          select: { name: true },
        });
        return buildBir1601cReport({
          year,
          month,
          tenantId: auth.tenantId,
          tenantName: tenant.name,
          agent,
          employees: [],
        });
      }

      // 2. Group sheets by employeeId.
      const byEmployee = new Map<string, Bir1601cSheetInput[]>();
      for (const s of sheets) {
        const bucket = byEmployee.get(s.employeeId) ?? [];
        bucket.push({
          grossCompensationCents: s.grossCompensationCents,
          mweExemptCompensationCents: s.mweExemptCompensationCents,
          nontaxableBasicCents: s.nontaxableBasicCents,
          nontaxableCompensationCents: s.nontaxableCompensationCents,
          nontaxable13MonthAndBenefitsCents: s.nontaxable13MonthAndBenefitsCents,
          grossTaxableIncomeCents: s.grossTaxableIncomeCents,
          withholdingTaxCents: s.withholdingTaxCents,
          comp: splitSheet(factsFromSheet(s)),
        });
        byEmployee.set(s.employeeId, bucket);
      }

      const employeeIds = [...byEmployee.keys()];

      // 3. Load employee details + tenant name.
      const [employees, tenant] = await Promise.all([
        tx.employee.findMany({
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
        }),
        tx.tenant.findUniqueOrThrow({
          where: { id: auth.tenantId },
          select: { name: true },
        }),
      ]);

      const tins = await loadEmployeeTins(tx, auth.tenantId, employeeIds);

      // 4. Assemble input for pure report builder.
      const employeeInputs: Bir1601cEmployeeInput[] = employees.map((e) => ({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        suffix: e.suffix,
        taxClassification: e.taxClassification,
        tin: tins.get(e.id) ?? null,
        sheets: byEmployee.get(e.id) ?? [],
      }));

      return buildBir1601cReport({
        year,
        month,
        tenantId: auth.tenantId,
        tenantName: tenant.name,
        agent,
        employees: employeeInputs,
      });
    });

    return ok(report);
  } catch (e) {
    console.error("[bir/1601c]", e);
    return err("Internal server error", 500);
  }
}
