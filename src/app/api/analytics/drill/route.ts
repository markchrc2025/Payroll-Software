/**
 * GET /api/analytics/drill?topic&from=YYYY-MM&to=YYYY-MM[&branchId][&departmentId][&employmentType][&employeeId]
 *
 * PAY-219 (Mark, 25 Nov 2026): drill-down analytics. REPORTS:READ sees every
 * topic by department. Pay per employee (payroll cost, contributions and tax,
 * 13th month, below the department totals) also needs PAYROLL:READ, so a role
 * that may read reports does not see individual pay unless it may read payroll.
 */
import type { NextRequest } from "next/server";
import type { EmploymentType } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { err, forbidden, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless, holdsAny } from "@/lib/authz/route-permission";
import { drill, DrillRefusal, payDetailHidden, TOPICS, type Topic } from "@/lib/analytics/drill";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["REPORTS", "READ"]);
  if (denied) return denied;

  const q = new URL(req.url).searchParams;
  const topic = (q.get("topic") ?? "payroll") as Topic;
  if (!TOPICS.includes(topic)) return err(`topic must be one of ${TOPICS.join(", ")}`, 400);
  const filters = {
    from: q.get("from") ?? "",
    to: q.get("to") ?? "",
    branchId: q.get("branchId") || null,
    departmentId: q.get("departmentId") || null,
    employmentType: (q.get("employmentType") || null) as EmploymentType | null,
    employeeId: q.get("employeeId") || null,
  };
  if (payDetailHidden(topic, filters, await holdsAny(auth, [["PAYROLL", "READ"]])))
    return forbidden("Pay per employee needs the Payroll read permission. Department totals are shown on the first level.");

  try {
    return ok(await drill(auth.tenantId, topic, filters));
  } catch (e) {
    if (e instanceof DrillRefusal) return err(e.message, 400);
    throw e;
  }
}
