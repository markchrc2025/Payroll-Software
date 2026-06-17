/**
 * GET /api/org-roles — List all org-wide role assignments for the tenant.
 *
 * Returns an object keyed by roleKey with the assigned employee's basic info.
 * Only "hr_manager" and "ceo" are supported here. Supervisor, line_manager,
 * and dept_head are resolved from Employee.immediateSupervisorId, Employee.managerId,
 * and Department.headId respectively.
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export const SINGLETON_ROLES = ["hr_manager", "ceo"] as const;
export type SingletonRoleKey = (typeof SINGLETON_ROLES)[number];

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.orgRole.findMany({
      where: { tenantId: auth.tenantId },
      select: {
        roleKey: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            position: { select: { title: true } },
          },
        },
      },
    })
  );

  // Return as a map { hr_manager: {...} | null, ceo: {...} | null }
  const map: Record<string, { employeeId: string; name: string; employeeNumber: string; positionTitle: string } | null> =
    Object.fromEntries(SINGLETON_ROLES.map((k) => [k, null]));

  for (const row of rows) {
    map[row.roleKey] = {
      employeeId: row.employeeId,
      name: [row.employee.firstName, row.employee.lastName].filter(Boolean).join(" "),
      employeeNumber: row.employee.employeeNumber,
      positionTitle: row.employee.position?.title ?? "",
    };
  }

  return ok(map);
}
