/**
 * Who may file, see and approve another employee's requests.
 *
 * Unit 0.22 found that "no approval chain configured" meant "approve
 * immediately": an employee's own ESS overtime wrote otMinutes onto a DTR, own
 * undertime was excused, and leave or DTR filed by any signed-in tenant user
 * was final with nobody else involved.
 *
 * Amendment 1, Mark's rulings of 10 Nov 2026:
 *   B5  With no chain, nothing is approved at filing. The request waits for the
 *       company OWNER (Tenant.ownerUserId, the first user granted the owner
 *       role, transferable) or a role granted the module's approve permission.
 *       The owner is always an approver. Never the requester.
 *   B6  No one files for another employee: filing happens in ESS, by the
 *       employee, and every employee must have ESS. No one sees another
 *       employee's records except the owner and roles granted the permission
 *       (role customization). Data privacy.
 */
import type { NextRequest } from "next/server";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import { withTenant, type TenantTx } from "@/lib/with-tenant";
import { checkPermission } from "@/lib/require-permission";
import { forbidden, unauthorized } from "@/lib/api-response";

export type RequestModule = "OT" | "UNDERTIME" | "DTR" | "LEAVE" | "EXPENSE";

/** The permission that approves each module's requests when no chain resolves. */
export const APPROVE_PERMISSION: Record<RequestModule, readonly [PermissionModule, PermissionAction]> = {
  OT: ["TIMESHEETS", "APPROVE"],
  UNDERTIME: ["TIMESHEETS", "APPROVE"],
  DTR: ["TIMESHEETS", "APPROVE"],
  LEAVE: ["LEAVES", "APPROVE"],
  // There is no EXPENSES permission module; reimbursements are paid through payroll.
  EXPENSE: ["PAYROLL", "APPROVE"],
};

/** The permission that lets someone see another employee's records of a module. */
export const READ_PERMISSION: Record<RequestModule, readonly [PermissionModule, PermissionAction]> = {
  OT: ["TIMESHEETS", "READ"],
  UNDERTIME: ["TIMESHEETS", "READ"],
  DTR: ["TIMESHEETS", "READ"],
  LEAVE: ["LEAVES", "READ"],
  EXPENSE: ["PAYROLL", "READ"],
};

/** The caller's own Employee id in this tenant, if they have one. */
export async function callerEmployeeId(tx: TenantTx, auth: AuthContext): Promise<string | null> {
  const me = await tx.employee.findFirst({
    where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
    select: { id: true },
  });
  return me?.id ?? null;
}

/** B5: the company owner is always an approver and always sees records. */
export async function isTenantOwner(tx: TenantTx, auth: AuthContext): Promise<boolean> {
  const t = await tx.tenant.findUnique({ where: { id: auth.tenantId }, select: { ownerUserId: true } });
  return !!t?.ownerUserId && t.ownerUserId === auth.userId;
}

async function holds(
  tx: TenantTx,
  auth: AuthContext,
  perm: readonly [PermissionModule, PermissionAction],
): Promise<boolean> {
  if (auth.systemRole === "SUPER_ADMIN") return true;
  if (await isTenantOwner(tx, auth)) return true;
  if (!auth.roleId) return false;
  return checkPermission(auth.tenantId, auth.roleId, perm[0], perm[1]);
}

/** Owner, or a role granted this permission (role customization). Does NOT check self. */
export function holdsPermission(
  tx: TenantTx,
  auth: AuthContext,
  perm: readonly [PermissionModule, PermissionAction],
) {
  return holds(tx, auth, perm);
}

/** B5: owner, or a role granted the module's approve permission. Does NOT check self. */
export function holdsApprovePermission(tx: TenantTx, auth: AuthContext, module: RequestModule) {
  return holds(tx, auth, APPROVE_PERMISSION[module]);
}

/** B6: may this caller see THIS employee's records of a module? Self, owner, or the read permission. */
export async function maySeeEmployeeRecords(
  tx: TenantTx,
  auth: AuthContext,
  employeeId: string,
  module: RequestModule,
): Promise<boolean> {
  if ((await callerEmployeeId(tx, auth)) === employeeId) return true;
  return holds(tx, auth, READ_PERMISSION[module]);
}

/** B6: may this caller see EVERYONE's records of a module (lists)? Owner or the read permission. */
export function maySeeAllRecords(tx: TenantTx, auth: AuthContext, module: RequestModule) {
  return holds(tx, auth, READ_PERMISSION[module]);
}

/**
 * B5 + self rule, for an approve route: the caller must not be the employee the
 * request is about, and must be the owner or hold the approve permission.
 */
export async function mayApproveFor(
  tx: TenantTx,
  auth: AuthContext,
  subjectEmployeeId: string,
  module: RequestModule,
): Promise<"ok" | "self" | "forbidden"> {
  if ((await callerEmployeeId(tx, auth)) === subjectEmployeeId) return "self";
  return (await holdsApprovePermission(tx, auth, module)) ? "ok" : "forbidden";
}

export const FILE_IN_ESS =
  "Requests are filed by the employee in ESS. No one can file on another employee's behalf.";

/**
 * B5 route guard for approve and reject routes: signed in, and the owner or a
 * role granted the module's approve permission. Replaces a plain
 * requirePermission(...APPROVE) so the owner is always an approver even if
 * their role is later customised. Self-approval is still refused inside each
 * route, against the specific request.
 */
export async function requireApprover(
  req: NextRequest,
  module: RequestModule,
): Promise<{ ctx: AuthContext } | Response> {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const allowed = await withTenant(auth.tenantId, (tx) => holdsApprovePermission(tx, auth, module));
  if (!allowed) return forbidden("You do not have permission to approve these requests");
  return { ctx: auth };
}
