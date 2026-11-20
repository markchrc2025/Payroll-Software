/**
 * GET /api/payroll/runs/[id]/cross-foot
 *
 * PAY-70: the run's payroll register totals and cross-foot checks (1) to (3):
 * each payslip adds up, the register equals its payslips, and the bank file
 * total equals the net pay to be credited (finalized runs).
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, ok } from "@/lib/api-response";
import { crossFootRun } from "@/lib/payroll/reports/cross-foot-data";
import { allTieOut } from "@/lib/payroll/reports/cross-foot";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "PAYROLL", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;
  try {
    const result = await crossFootRun(auth.tenantId, id);
    if (!result) return err("Payroll run not found", 404);
    const register = Object.fromEntries(Object.entries(result.register).map(([k, v]) => [k, v.toString()]));
    // PAY-203 (ruling 3): a run with no payslips has nothing to tie out.
    const empty = result.register.payslips === 0;
    return ok({ status: result.status, empty, tiesOut: !empty && allTieOut(result.checks), register, checks: empty ? [] : result.checks });
  } catch (e) {
    console.error("[runs/cross-foot]", e);
    return err("Internal server error", 500);
  }
}
