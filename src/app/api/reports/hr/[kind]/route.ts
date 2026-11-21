/**
 * GET /api/reports/hr/[kind]?from&to | year | asOf, &employeeId
 * Wave D (PAY-214): the four read-only HR reports (src/lib/reports/hr-reports.ts).
 * Expense: PAYROLL:READ. Leave: LEAVES:READ. Time clock: TIMESHEETS:READ.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { loadHrReport } from "@/lib/reports/hr-reports";
import { HR_REPORTS, isHrReportKind } from "@/lib/reports/hr-reports-view";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string | null) => (s && DATE.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
const manilaToday = () => day(new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10))!;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { kind } = await params;
  if (!isHrReportKind(kind)) return err("Unknown report", 404);
  const [m, a] = HR_REPORTS[kind].permission;
  const denied = await forbidUnless(auth, [m, a]);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const today = manilaToday();
  const from = day(sp.get("from")) ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to = day(sp.get("to")) ?? today;
  if (to < from) return err("The end date is before the start date", 422);
  if (kind === "time-clock" && to.getTime() - from.getTime() > 92 * 86_400_000) return err("The time clock report covers at most 3 months at a time", 422);
  const year = Number(sp.get("year") ?? today.getUTCFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return err("Invalid year", 422);
  const asOf = day(sp.get("asOf")) ?? today;
  const report = await withTenant(auth.tenantId, (tx) => loadHrReport(tx, auth.tenantId, kind, { from, to, year, asOf, employeeId: sp.get("employeeId") || null }));
  return ok(report);
}
