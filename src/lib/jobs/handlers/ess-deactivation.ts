/**
 * Job: ess.deactivation  (cron — hourly)
 *
 * Enforces scheduled ESS deactivations: any employee whose `essDeactivateAt`
 * has passed but is still INVITED/ACTIVE is flipped to DISABLED and their live
 * ESS sessions are revoked. The auth gate already denies login the moment the
 * scheduled time passes, so this is the cleanup that makes the visible status
 * and sessions consistent. Like HR's disable, it deletes the employee's ESS
 * passkeys (PAY-115). Idempotent. Uses prismaAdmin (bypasses RLS).
 */

import prismaAdmin from "@/lib/prisma-admin";
import { retirePasskeys } from "@/lib/ess-credential-links";

export async function handleEssDeactivationSweep(): Promise<void> {
  const now = new Date();

  const due = await prismaAdmin.employee.findMany({
    where: {
      essDeactivateAt: { not: null, lte: now },
      essAccessStatus: { in: ["INVITED", "ACTIVE"] },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (due.length === 0) return;

  let passkeys = 0;
  for (const emp of due) {
    passkeys += await prismaAdmin.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: emp.id },
        data: { essAccessStatus: "DISABLED" },
      });
      await tx.essSession.updateMany({
        where: { employeeId: emp.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return retirePasskeys(tx, emp.id);
    });
  }

  console.log(`[jobs/ess.deactivation] Disabled ${due.length} employee(s) past their scheduled deactivation; deleted ${passkeys} passkey(s).`);
}
