/**
 * src/lib/leave/filing.ts
 *
 * Shared helpers for filing a leave request with automatic Leave-Without-Pay
 * (LWOP) overflow: any amount beyond the available entitlement is filed as
 * unpaid rather than rejected.
 */
import type { TenantTx } from "@/lib/with-tenant";

/** Split a requested amount into paid (entitled) and unpaid (LWOP) units. */
export function splitLeaveUnits(
  available: number,
  amount: number,
): { paidUnits: number; unpaidUnits: number } {
  const paidUnits = Math.max(0, Math.min(available, amount));
  return { paidUnits, unpaidUnits: Math.max(0, amount - paidUnits) };
}

/**
 * Find the employee's LeaveBalance for the year, creating a zero balance if
 * none exists (so an employee with no entitlement can still file — fully LWOP).
 * Returns the balance id and the currently available units.
 */
export async function resolveOrCreateBalance(
  tx: TenantTx,
  tenantId: string,
  employeeId: string,
  leaveTypeId: string,
  year: number,
): Promise<{ id: string; available: number }> {
  let balance = await tx.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
  if (!balance) {
    balance = await tx.leaveBalance.create({
      data: { tenantId, employeeId, leaveTypeId, year },
    });
  }
  const available =
    balance.earned.toNumber() - balance.used.toNumber() - balance.forfeited.toNumber();
  return { id: balance.id, available };
}
