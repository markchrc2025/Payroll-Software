/**
 * Self-approval guard.
 *
 * An approver must never approve (or reject) a record that belongs to
 * themselves. This resolves the acting user's linked Employee and compares it
 * to the record's owner.
 */
import type { TenantTx } from "@/lib/with-tenant";

/**
 * True when the acting user is the employee who owns the record — i.e. this
 * would be a self-approval/self-rejection and must be blocked.
 */
export async function isSelfAction(
  tx: TenantTx,
  tenantId: string,
  userId: string | null | undefined,
  recordEmployeeId: string,
): Promise<boolean> {
  if (!userId) return false;
  const actor = await tx.employee.findFirst({
    where: { userId, tenantId },
    select: { id: true },
  });
  return actor?.id != null && actor.id === recordEmployeeId;
}
