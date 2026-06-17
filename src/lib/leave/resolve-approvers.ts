/**
 * Resolves the ordered approver chain for a leave request.
 *
 * Given an employee + a LeaveWorkflow's `approvers` array
 * (e.g. ["supervisor","dept_head","hr_manager"]), returns one slot per step:
 *   - A resolved approver record, or
 *   - null when the role cannot be resolved for this employee (slot is skipped).
 *
 * Self-approval guard: if the resolved approver is the same person filing the
 * leave, that slot is also returned as null (skipped).
 */

import type { TenantTx } from "@/lib/with-tenant";

export type RoleKey =
  | "supervisor"
  | "line_manager"
  | "dept_head"
  | "hr_manager"
  | "ceo";

export type ResolvedSlot = {
  roleKey: RoleKey;
  approverEmployeeId: string;
  approverName: string;
  approverEmployeeNumber: string;
} | null;

/**
 * Resolves a workflow approver chain for a given employee.
 *
 * @param requesterId   - Employee ID of the person filing the leave.
 * @param tenantId      - Tenant context (used for OrgRole lookups).
 * @param approverKeys  - Ordered array of role keys from `LeaveWorkflow.approvers`.
 * @param tx            - Active Prisma transaction (from withTenant callback).
 * @returns             Ordered array of resolved/null slots, one per step.
 */
export async function resolveChain(
  requesterId: string,
  tenantId: string,
  approverKeys: RoleKey[],
  tx: TenantTx,
): Promise<ResolvedSlot[]> {
  if (!approverKeys.length) return [];

  // Fetch the requester with all FK fields needed for role resolution.
  const requester = await tx.employee.findFirst({
    where: { id: requesterId, tenantId, deletedAt: null },
    select: {
      id: true,
      immediateSupervisorId: true,
      managerId: true,
      department: {
        select: {
          headId: true,
        },
      },
    },
  });

  if (!requester) return approverKeys.map(() => null);

  // Pre-fetch org-wide singleton roles in one query.
  const orgRoleKeys = approverKeys.filter(
    (k): k is "hr_manager" | "ceo" => k === "hr_manager" || k === "ceo",
  );

  const orgRoles =
    orgRoleKeys.length > 0
      ? await tx.orgRole.findMany({
          where: { tenantId, roleKey: { in: orgRoleKeys } },
          select: { roleKey: true, employeeId: true },
        })
      : [];

  const orgRoleMap = new Map(orgRoles.map((r) => [r.roleKey, r.employeeId]));

  // Collect distinct employee IDs we need to fetch names for.
  const candidateIds = new Set<string>();
  for (const key of approverKeys) {
    const id = resolveId(key, requester, orgRoleMap);
    if (id) candidateIds.add(id);
  }

  // Bulk fetch names.
  const approverRecords =
    candidateIds.size > 0
      ? await tx.employee.findMany({
          where: { id: { in: [...candidateIds] }, tenantId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        })
      : [];

  const approverById = new Map(approverRecords.map((e) => [e.id, e]));

  // Build the result array.
  return approverKeys.map((key): ResolvedSlot => {
    const empId = resolveId(key, requester, orgRoleMap);
    if (!empId) return null;

    // Self-approval guard.
    if (empId === requesterId) return null;

    const emp = approverById.get(empId);
    if (!emp) return null;

    return {
      roleKey: key,
      approverEmployeeId: emp.id,
      approverName: [emp.firstName, emp.lastName].filter(Boolean).join(" "),
      approverEmployeeNumber: emp.employeeNumber,
    };
  });
}

function resolveId(
  key: RoleKey,
  requester: {
    immediateSupervisorId: string | null;
    managerId: string | null;
    department: { headId: string | null } | null;
  },
  orgRoleMap: Map<string, string>,
): string | null {
  switch (key) {
    case "supervisor":
      return requester.immediateSupervisorId ?? null;
    case "line_manager":
      return requester.managerId ?? null;
    case "dept_head":
      return requester.department?.headId ?? null;
    case "hr_manager":
      return orgRoleMap.get("hr_manager") ?? null;
    case "ceo":
      return orgRoleMap.get("ceo") ?? null;
  }
}
