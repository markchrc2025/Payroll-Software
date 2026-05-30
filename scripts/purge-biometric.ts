/**
 * purge-biometric.ts — Phase Z data retention purge
 *
 * Nulls selfieKey, latitude, longitude on AttendanceLog rows where:
 *   - punchedAt < NOW() - 30 days
 *   - The employee's DTRRecord for the same date is APPROVED (finalized)
 *   - At least one of selfieKey / latitude / longitude is non-null
 *
 * Uses DIRECT_DATABASE_URL (BYPASSRLS) so it can access all tenants.
 * Safe to run repeatedly — idempotent.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/purge-biometric.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const isDryRun = process.argv.includes("--dry-run");

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
const prismaAdmin = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log(
    `[purge-biometric] cutoff=${cutoff.toISOString()} dry-run=${isDryRun}`,
  );

  // Find AttendanceLog rows older than the cutoff with biometric data still set,
  // whose employee's DTRRecord for the same calendar date is APPROVED.
  //
  // Strategy: fetch eligible logs in batches of 500, then bulk-update.
  let totalPurged = 0;
  let cursor: string | undefined;

  for (;;) {
    const logs = await prismaAdmin.attendanceLog.findMany({
      where: {
        punchedAt: { lt: cutoff },
        OR: [
          { selfieKey: { not: null } },
          { latitude: { not: null } },
          { longitude: { not: null } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        employeeId: true,
        punchedAt: true,
      },
      take: 500,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
    });

    if (logs.length === 0) break;
    cursor = logs[logs.length - 1].id;

    // For each log, check whether there is an APPROVED DTRRecord for that date.
    const eligible: string[] = [];
    for (const log of logs) {
      // DTRRecord.date is stored as UTC midnight; normalise punch date to same.
      const date = new Date(log.punchedAt);
      date.setUTCHours(0, 0, 0, 0);

      const dtr = await prismaAdmin.dTRRecord.findFirst({
        where: {
          tenantId: log.tenantId,
          employeeId: log.employeeId,
          date,
          approvalStatus: "APPROVED",
        },
        select: { id: true },
      });
      if (dtr) eligible.push(log.id);
    }

    if (eligible.length === 0) continue;

    totalPurged += eligible.length;
    if (!isDryRun) {
      await prismaAdmin.attendanceLog.updateMany({
        where: { id: { in: eligible } },
        data: { selfieKey: null, latitude: null, longitude: null },
      });
    }

    console.log(
      `[purge-biometric] batch: ${eligible.length} rows eligible` +
        (isDryRun ? " (dry-run, not updated)" : " purged"),
    );
  }

  console.log(
    `[purge-biometric] done. total=${totalPurged}` +
      (isDryRun ? " (dry-run)" : ""),
  );
}

main()
  .catch((e) => {
    console.error("[purge-biometric] error:", e);
    process.exit(1);
  })
  .finally(() => prismaAdmin.$disconnect());
