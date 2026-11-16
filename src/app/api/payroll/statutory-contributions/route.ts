/**
 * /api/payroll/statutory-contributions (PAY-160)
 *
 *   GET ?year=YYYY&month=M          every employee's SSS, PhilHealth and
 *                                   Pag-IBIG shares for that month.
 *   GET ?year=YYYY&employeeId=ID    one employee's shares, month by month,
 *                                   for that year (their history).
 *   &format=csv                     the same rows as a CSV download.
 *
 * Only FINALIZED runs count, by the month their period ends in: the same
 * rule as the SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF, so the totals agree
 * with those forms. Read-only.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import {
  buildStatutoryContributions,
  contributionsCsv,
  type ContributionEmployee,
} from "@/lib/payroll/reports/statutory-contributions";

const query = z
  .object({
    year: z.coerce.number().int().min(2000, "year must be between 2000 and 2099").max(2099, "year must be between 2000 and 2099"),
    month: z.coerce.number().int().min(1, "month must be between 1 and 12").max(12, "month must be between 1 and 12").optional(),
    employeeId: z.string().min(1).max(64).optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .refine((q) => q.month !== undefined || q.employeeId !== undefined, {
    message: "Give a month, or an employee for their history",
  });

const ym = (d: Date) => d.toISOString().slice(0, 7);
const fullName = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`;

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const parsed = query.safeParse({
    year: sp.get("year") ?? undefined,
    month: sp.get("month") ?? undefined,
    employeeId: sp.get("employeeId") ?? undefined,
    format: sp.get("format") ?? undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  const { year, month, employeeId, format } = parsed.data;

  // A month narrows to that month; otherwise the whole year (employee history).
  const from = new Date(Date.UTC(year, month ? month - 1 : 0, 1));
  const to = new Date(Date.UTC(year, month ? month : 12, 0, 23, 59, 59, 999));
  const yearFrom = new Date(Date.UTC(year, 0, 1));
  const yearTo = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const result = await withTenant(auth.tenantId, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(employeeId ? { employeeId } : {}),
        payrollBook: { status: "FINALIZED", periodEnd: { gte: from, lte: to } },
      },
      select: {
        employeeId: true,
        sssEeCents: true,
        sssErCents: true,
        sssEcCents: true,
        philhealthEeCents: true,
        philhealthErCents: true,
        pagibigEeCents: true,
        pagibigErCents: true,
        statutoryBreakdown: true,
        payrollBook: { select: { periodEnd: true } },
      },
    });
    // Everyone with a finalized sheet this year, for the employee filter.
    const yearSheets = await tx.payrollSheet.findMany({
      where: { tenantId: auth.tenantId, payrollBook: { status: "FINALIZED", periodEnd: { gte: yearFrom, lte: yearTo } } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    const ids = [...new Set([...yearSheets.map((s) => s.employeeId), ...sheets.map((s) => s.employeeId)])];
    const people = await tx.employee.findMany({
      where: { tenantId: auth.tenantId, id: { in: ids } },
      select: { id: true, employeeNumber: true, firstName: true, lastName: true },
    });
    const employees: ContributionEmployee[] = people
      .map((e) => ({ employeeId: e.id, employeeNumber: e.employeeNumber, name: fullName(e) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const report = buildStatutoryContributions(
      sheets.map((s) => ({ ...s, month: ym(s.payrollBook.periodEnd) })),
      employees,
    );
    return { report, employees };
  });

  if (format === "csv") {
    const who = employeeId ? result.employees.find((e) => e.employeeId === employeeId)?.employeeNumber ?? "employee" : null;
    const name = who
      ? `statutory-contributions-${year}-${who.replace(/[^A-Za-z0-9_-]/g, "")}.csv`
      : `statutory-contributions-${year}-${String(month).padStart(2, "0")}.csv`;
    return new Response(contributionsCsv(result.report), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return ok({
    year,
    month: month ?? null,
    employeeId: employeeId ?? null,
    employees: result.employees,
    ...result.report,
  });
}
