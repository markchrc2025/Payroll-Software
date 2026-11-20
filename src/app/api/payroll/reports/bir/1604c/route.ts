/**
 * GET /api/payroll/reports/bir/1604c?year=YYYY
 *
 * BIR Form 1604-C (January 2018) with the alphalist of employees in the
 * format of RMC 160-2022 Annex A (Schedule 1: employees; Schedule 2: minimum
 * wage earners), from the FINALIZED payroll runs whose pay period ends in
 * the year and the year-to-date openings (PAY-144).
 *
 * PAY-71: mandated structure, no added columns, footnotes only.
 *
 * Response: { data: Bir1604cReport }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { buildBir1604cReport } from "@/lib/payroll/reports/bir-1604c";
import {
  loadAnnualTaxDue, loadBirYearEmployees, loadWithholdingAgent,
} from "@/lib/payroll/reports/bir-data";
import { buildBir2316Report } from "@/lib/payroll/reports/bir-2316";
import { bir2316Checks } from "@/lib/payroll/reports/cross-foot";
import { certificateFigures, crossFootAlphalist, yearPayslipFigures } from "@/lib/payroll/reports/cross-foot-data";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000, "year must be 2000 or later").max(2099, "year must be 2099 or earlier"),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["REPORTS", "READ"]);
  if (denied) return denied;

  const parsed = querySchema.safeParse({ year: new URL(req.url).searchParams.get("year") });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  const { year } = parsed.data;

  try {
    const report = await withTenant(auth.tenantId, async (tx) => {
      const [agent, taxDue, employees] = [
        await loadWithholdingAgent(tx, auth.tenantId),
        await loadAnnualTaxDue(tx, auth.tenantId, year),
        await loadBirYearEmployees(tx, auth.tenantId, year),
      ];
      const built = buildBir1604cReport({ year, tenantId: auth.tenantId, tenantName: agent.name, agent, taxDue, employees });
      // PAY-70: the alphalist against all the 2316s, and the 2316s against the payslips.
      const certs = buildBir2316Report({ year, tenantId: auth.tenantId, tenantName: agent.name, employer: agent, taxDue, employees }).certificates;
      const crossFoot = [
        ...crossFootAlphalist(built.form, certs),
        ...bir2316Checks(certificateFigures(certs), await yearPayslipFigures(tx, auth.tenantId, year)),
      ];
      return { ...built, crossFoot };
    });
    return ok(report);
  } catch (e) {
    console.error("[bir/1604c]", e);
    return err("Internal server error", 500);
  }
}
