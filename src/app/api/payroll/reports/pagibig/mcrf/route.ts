/**
 * GET /api/payroll/reports/pagibig/mcrf?year=YYYY&month=M
 *
 * Returns Pag-IBIG MCRF (Monthly Contribution Remittance Form) data for the
 * given calendar year and month.  Only FINALIZED PayrollBooks whose
 * `periodEnd` falls within the requested month are included.
 *
 * Response: { data: PagibigMcrfReport }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import {
  buildPagibigMcrfReport,
  type PagibigMcrfEmployeeInput,
  type PagibigMcrfSheetInput,
} from "@/lib/payroll/reports/pagibig-mcrf";

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

/** Extract pagibigMfsCents from the statutoryBreakdown JSON field. */
function parsePagibigMfs(breakdown: unknown): bigint {
  const bd = breakdown as { bases?: { pagibigMfsCents?: string } } | null;
  return BigInt(bd?.bases?.pagibigMfsCents ?? "0");
}

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  }
  const { year, month } = parsed.data;

  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  try {
    const report = await withTenant(auth.tenantId, async (tx) => {
      const sheets = await tx.payrollSheet.findMany({
        where: {
          tenantId: auth.tenantId,
          payrollBook: {
            status: "FINALIZED",
            periodEnd: { gte: rangeStart, lte: rangeEnd },
          },
        },
        select: {
          employeeId: true,
          pagibigEeCents: true,
          pagibigErCents: true,
          statutoryBreakdown: true,
        },
      });

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: auth.tenantId },
        select: { name: true },
      });

      if (sheets.length === 0) {
        return buildPagibigMcrfReport({
          year, month, tenantId: auth.tenantId, tenantName: tenant.name,
          employees: [],
        });
      }

      const byEmployee = new Map<string, PagibigMcrfSheetInput[]>();
      for (const s of sheets) {
        const bucket = byEmployee.get(s.employeeId) ?? [];
        bucket.push({
          pagibigEeCents: s.pagibigEeCents,
          pagibigErCents: s.pagibigErCents,
          pagibigMfsCents: parsePagibigMfs(s.statutoryBreakdown),
        });
        byEmployee.set(s.employeeId, bucket);
      }

      const employees = await tx.employee.findMany({
        where: { id: { in: [...byEmployee.keys()] } },
        select: {
          id: true, employeeNumber: true, firstName: true,
          middleName: true, lastName: true, suffix: true,
        },
      });

      const employeeInputs: PagibigMcrfEmployeeInput[] = employees.map((e) => ({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        suffix: e.suffix,
        sheets: byEmployee.get(e.id) ?? [],
      }));

      return buildPagibigMcrfReport({
        year, month, tenantId: auth.tenantId, tenantName: tenant.name,
        employees: employeeInputs,
      });
    });

    return ok({ data: report });
  } catch (e) {
    console.error("[pagibig/mcrf]", e);
    return err("Internal server error", 500);
  }
}
