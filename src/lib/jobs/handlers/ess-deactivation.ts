/**
 * Job: ess.deactivation  (cron — hourly)
 *
 * Enforces scheduled ESS deactivations: any employee whose `essDeactivateAt`
 * has passed but is still INVITED/ACTIVE is flipped to DISABLED and their live
 * ESS sessions are revoked. The auth gate already denies login the moment the
 * scheduled time passes, so this is the cleanup that makes the visible status
 * and sessions consistent. Idempotent. Uses prismaAdmin (bypasses RLS).
 */

import prismaAdmin from "@/lib/prisma-admin";

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

  for (const emp of due) {
    await prismaAdmin.employee.update({
      where: { id: emp.id },
      data: { essAccessStatus: "DISABLED" },
    });
    await prismaAdmin.essSession.updateMany({
      where: { employeeId: emp.id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  console.log(`[jobs/ess.deactivation] Disabled ${due.length} employee(s) past their scheduled deactivation.`);
}
