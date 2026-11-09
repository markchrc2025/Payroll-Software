/**
 * Unit 0.22: who may approve a request when NO approval chain resolves.
 *
 * Before 0.22, "no chain configured" meant "approve immediately": an
 * employee's own ESS overtime request wrote otMinutes onto a DTRRecord, own
 * undertime was excused, and leave or DTR filed by a tenant user was final
 * with nobody else involved. The absence of configuration was the trigger, so
 * a tenant that had not finished setting up approvals was the exposed case.
 *
 * Rule now: with no chain, a request is approved at filing ONLY when the
 * person filing it is a second party, meaning not the employee the request is
 * about, who holds the module's approve permission. Otherwise it stays pending
 * and HR approves it through the existing no-workflow approve routes.
 */
import type { ApprovalModule, PermissionAction, PermissionModule } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import type { TenantTx } from "@/lib/with-tenant";
import { checkPermission } from "@/lib/require-permission";

export const NO_CHAIN_APPROVE_PERMISSION: Record<
  "OT" | "UNDERTIME" | "DTR" | "LEAVE",
  readonly [PermissionModule, PermissionAction]
> = {
  OT: ["TIMESHEETS", "APPROVE"],
  UNDERTIME: ["TIMESHEETS", "APPROVE"],
  DTR: ["TIMESHEETS", "APPROVE"],
  LEAVE: ["LEAVES", "APPROVE"],
};

/** The caller's own Employee id in this tenant, if they have one. */
export async function callerEmployeeId(tx: TenantTx, auth: AuthContext): Promise<string | null> {
  const me = await tx.employee.findFirst({
    where: { userId: auth.userId, tenantId: auth.tenantId, deletedAt: null },
    select: { id: true },
  });
  return me?.id ?? null;
}

export async function holdsApprovePermission(
  auth: AuthContext,
  module: keyof typeof NO_CHAIN_APPROVE_PERMISSION,
): Promise<boolean> {
  if (auth.systemRole === "SUPER_ADMIN") return true;
  if (!auth.roleId) return false;
  const [m, a] = NO_CHAIN_APPROVE_PERMISSION[module];
  return checkPermission(auth.tenantId, auth.roleId, m, a);
}

/** True only for a caller who is NOT the subject employee and holds the approve permission. */
export async function isSecondPartyApprover(
  tx: TenantTx,
  auth: AuthContext,
  subjectEmployeeId: string,
  module: keyof typeof NO_CHAIN_APPROVE_PERMISSION & ApprovalModule,
): Promise<boolean> {
  const me = await callerEmployeeId(tx, auth);
  if (me !== null && me === subjectEmployeeId) return false;
  return holdsApprovePermission(auth, module);
}
