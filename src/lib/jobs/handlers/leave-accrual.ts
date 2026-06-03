/**
 * Job: leave.accrual  (cron — runs on the 1st of every month)
 *
 * For every active tenant → active leave type → active employee:
 *   • MONTHLY leave types: accrue every month
 *   • QUARTERLY leave types: accrue in months 3, 6, 9, 12
 *   • ANNUALLY: accrue in month 1
 *   • UPON_REGULARIZATION: accrue once when the employee is REGULAR and has
 *     never received this accrual in the current year
 *
 * `earned` is capped at `maxAccruableBalance` when set.
 * Uses prismaAdmin (bypasses RLS) since this runs as a background job.
 */

import prismaAdmin from "@/lib/prisma-admin";
import Decimal from "decimal.js";

export async function handleLeaveAccrual(): Promise<void> {
  const now = new Date();
  // Run in PH timezone (UTC+8)
  const phOffset = 8 * 60 * 60 * 1000;
  const phNow = new Date(now.getTime() + phOffset);
  const month = phNow.getUTCMonth() + 1; // 1–12
  const year = phNow.getUTCFullYear();

  const isQuarterlyMonth = month % 3 === 0; // 3, 6, 9, 12
  const isAnnualMonth = month === 1;

  console.log(`[jobs/leave.accrual] Running for ${year}-${String(month).padStart(2, "0")}`);

  const tenants = await prismaAdmin.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let totalAccrued = 0;

  for (const tenant of tenants) {
    const leaveTypes = await prismaAdmin.leaveType.findMany({
      where: { tenantId: tenant.id, isActive: true, deletedAt: null },
    });

    const employees = await prismaAdmin.employee.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] },
      },
      select: { id: true, employmentStatus: true, regularizationDate: true },
    });

    for (const lt of leaveTypes) {
      const { accrualFrequency, accrualAmount, maxAccruableBalance } = lt;

      // Skip if frequency doesn't match this run
      if (accrualFrequency === "QUARTERLY" && !isQuarterlyMonth) continue;
      if (accrualFrequency === "ANNUALLY" && !isAnnualMonth) continue;

      for (const emp of employees) {
        // UPON_REGULARIZATION: only REGULAR employees
        if (
          accrualFrequency === "UPON_REGULARIZATION" &&
          emp.employmentStatus !== "REGULAR"
        ) {
          continue;
        }

        // Upsert the balance row for this year
        const existing = await prismaAdmin.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year,
            },
          },
        });

        // UPON_REGULARIZATION: only accrue once per year
        if (accrualFrequency === "UPON_REGULARIZATION" && existing) continue;

        const currentEarned = existing?.earned ?? new Decimal(0);
        let newEarned = new Decimal(currentEarned).add(new Decimal(accrualAmount));

        // Cap at maxAccruableBalance if set
        if (maxAccruableBalance !== null) {
          const cap = new Decimal(maxAccruableBalance);
          if (newEarned.greaterThan(cap)) {
            newEarned = cap;
          }
        }

        // No-op if already at cap
        if (newEarned.equals(currentEarned)) continue;

        const addedAmount = newEarned.sub(currentEarned);

        if (existing) {
          await prismaAdmin.leaveBalance.update({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: emp.id,
                leaveTypeId: lt.id,
                year,
              },
            },
            data: { earned: newEarned },
          });
        } else {
          await prismaAdmin.leaveBalance.create({
            data: {
              tenantId: tenant.id,
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year,
              earned: addedAmount,
            },
          });
        }

        totalAccrued++;
      }
    }
  }

  console.log(`[jobs/leave.accrual] Done — ${totalAccrued} balance rows updated`);
}
