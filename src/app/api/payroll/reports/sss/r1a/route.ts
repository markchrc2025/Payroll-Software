/**
 * GET /api/payroll/reports/sss/r1a?year=YYYY&month=M
 *
 * Returns SSS R-1A (Monthly Report of Employee Contributions) data for the
 * given calendar year and month.  Only FINALIZED PayrollBooks whose
 * `periodEnd` falls within the requested month are included.
 *
 * Response: { data: SssR1aReport }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import {
  buildSssR1aReport,
  type SssR1aEmployeeInput,
  type SssR1aSheetInput,
} from "@/lib/payroll/reports/sss-r1a";

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

/** Extract sssMscCents from the statutoryBreakdown JSON field. */
function parseSssMsc(breakdown: unknown): bigint {
  const bd = breakdown as { bases?: { sssMscCents?: string } } | null;
  return BigInt(bd?.bases?.sssMscCents ?? "0");
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
          sssEeCents: true,
          sssErCents: true,
          sssEcCents: true,
          statutoryBreakdown: true,
        },
      });

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: auth.tenantId },
        select: { name: true },
      });

      if (sheets.length === 0) {
        return buildSssR1aReport({
          year, month, tenantId: auth.tenantId, tenantName: tenant.name,
          employees: [],
        });
      }

      // Group by employeeId.
      const byEmployee = new Map<string, SssR1aSheetInput[]>();
      for (const s of sheets) {
        const bucket = byEmployee.get(s.employeeId) ?? [];
        bucket.push({
          sssEeCents: s.sssEeCents,
          sssErCents: s.sssErCents,
          sssEcCents: s.sssEcCents,
          sssMscCents: parseSssMsc(s.statutoryBreakdown),
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

      const employeeInputs: SssR1aEmployeeInput[] = employees.map((e) => ({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        suffix: e.suffix,
        sheets: byEmployee.get(e.id) ?? [],
      }));

      return buildSssR1aReport({
        year, month, tenantId: auth.tenantId, tenantName: tenant.name,
        employees: employeeInputs,
      });
    });

    return ok({ data: report });
  } catch (e) {
    console.error("[sss/r1a]", e);
    return err("Internal server error", 500);
  }
}
