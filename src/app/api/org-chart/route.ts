/**
 * GET /api/org-chart — Whole-company org-chart payload in a single call.
 *
 * Returns every active employee (with their reporting line), the vacant
 * executive positions (Executive-level positions with no incumbent), plus the
 * department and branch lists used by the filters. The reporting line is
 * `immediateSupervisorId` (person → person) or, when an employee reports to a
 * vacant role, `reportsToPositionId` (person → position).
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: Mark's ruling of 10 Nov: the org chart is READ-ONLY for every employee. It shows names, positions, departments and reporting lines, no pay, IDs or personal details. It is built from each employee's level and reporting manager, and every way of changing those needs a permission only the owner and HR roles hold: org-chart/reassign and placements EMPLOYEES:UPDATE, employee edit EMPLOYEES:UPDATE, positions SETTINGS:UPDATE, movement approval EMPLOYEES:APPROVE (unit 0.25)

  const data = await withTenant(auth.tenantId, async (tx) => {
    const [employees, positions, departments, branches, tenant] = await Promise.all([
      tx.employee.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        orderBy: { employeeNumber: "asc" },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          immediateSupervisorId: true,
          reportsToPositionId: true,
          position: { select: { id: true, title: true } },
          department: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      // All positions — used to derive vacant nodes in the org chart.
      tx.position.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          department: { select: { id: true, name: true } },
          _count: { select: { employees: { where: { deletedAt: null } } } },
        },
      }),
      tx.department.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      tx.branch.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      tx.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { name: true, tradeName: true },
      }),
    ]);

    return {
      companyName: tenant?.tradeName || tenant?.name || "Organization",
      employees: employees.map((e) => ({
        id: e.id,
        employeeNumber: e.employeeNumber,
        name: [e.firstName, e.lastName].filter(Boolean).join(" ").trim(),
        positionId: e.position?.id ?? null,
        positionTitle: e.position?.title ?? "",
        department: e.department?.name ?? "",
        branch: e.branch?.name ?? "",
        immediateSupervisorId: e.immediateSupervisorId,
        reportsToPositionId: e.reportsToPositionId,
      })),
      // Only positions with zero incumbents are vacant nodes.
      vacantPositions: positions
        .filter((p) => p._count.employees === 0)
        .map((p) => ({
          id: p.id,
          title: p.title,
          department: p.department?.name ?? "Executive",
        })),
      departments,
      branches,
    };
  });

  return ok(data);
}
