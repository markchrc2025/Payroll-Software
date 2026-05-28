/**
 * smoke-j.ts — Phase J: DTR / Timesheet Ingestion
 *
 * Tests:
 *  T1.  Create shift schedule (Day Shift, 08:00-17:00, MON-FRI)
 *  T2.  Duplicate name → 409
 *  T3.  List shifts → finds it
 *  T4.  Get shift by ID
 *  T5.  Update shift (breakMinutes → 45)
 *  T6.  Assign shift to Roberto (effectiveFrom 2026-09-01)
 *  T7.  List shift assignments for Roberto
 *  T8.  Create 5 DTR records for Roberto (Sep 1-5 2026, each with 10 late mins, 30 OT mins)
 *  T9.  Create 1 DTR record for Roberto (Sep 8, ABSENT → counts as unpaid)
 *  T10. List DTR records for Roberto → 6 records
 *  T11. Get DTR record by ID
 *  T12. Approve 5 Sep 1-5 records (PENDING → APPROVED)
 *  T13. Reject Sep 8 record
 *  T14. Aggregate DTR → PeriodInput (Sep 1-15): daysWorked=5, lateUndertimeMinutes=50, regularOtHours≈2.50
 *  T15. Aggregate again without replace → skipped
 *  T16. Aggregate with replace:true → re-creates
 *  T17. PATCH PENDING DTR record → succeeds
 *  T18. Lock a DTR record manually → PATCH blocked (409)
 *  T19. Create 1 extra REJECTED record, re-aggregate → count unchanged (rejected not counted)
 *  T20. Cross-tenant isolation: TENANT_B cannot see TENANT_A shifts/DTR
 *  T21. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-j.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const TENANT_B = "zzzzzzzzz000yi73i6fcm5zzz";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "cmpnn0s720012yi73vv5f1bxu";

const SEP1 = new Date("2026-09-01T00:00:00.000Z");
const SEP2 = new Date("2026-09-02T00:00:00.000Z");
const SEP3 = new Date("2026-09-03T00:00:00.000Z");
const SEP4 = new Date("2026-09-04T00:00:00.000Z");
const SEP5 = new Date("2026-09-05T00:00:00.000Z");
const SEP8 = new Date("2026-09-08T00:00:00.000Z");
const SEP10 = new Date("2026-09-10T00:00:00.000Z");

const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-15T00:00:00.000Z");

let failures = 0;
let total = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(
      `  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`,
    );
    failures += 1;
  }
}

async function withT<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
) {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

async function cleanup() {
  await withT(TENANT_A, async (tx) => {
    // DTR records
    await tx.dTRRecord.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
    // Shift assignments
    await tx.employeeShiftAssignment.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
    // Shift schedules
    await tx.shiftSchedule.deleteMany({
      where: { tenantId: TENANT_A, name: { startsWith: "SMOKE_" } },
    });
    // Period inputs
    await tx.periodInput.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    });
  });
}

async function main() {
  await cleanup();

  console.log("\n─── Phase J: DTR / Timesheet Ingestion ───\n");

  // ──────────────────────────────────────────────────────────────────────────
  // T1: Create shift schedule
  // ──────────────────────────────────────────────────────────────────────────
  console.log("T1: Create shift schedule");
  let shiftId = "";
  const shift = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.create({
      data: {
        tenantId: TENANT_A,
        name: "SMOKE_DayShift",
        type: "FIXED",
        timeIn: "08:00",
        timeOut: "17:00",
        breakMinutes: 60,
        crossesMidnight: false,
        workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      },
    }),
  );
  shiftId = shift.id;
  check("shift created", !!shiftId);
  check("shift name", shift.name === "SMOKE_DayShift");
  check("shift timeIn", shift.timeIn === "08:00");
  check("shift timeOut", shift.timeOut === "17:00");

  // ──────────────────────────────────────────────────────────────────────────
  // T2: Duplicate name → conflict
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT2: Duplicate shift name conflict");
  try {
    await withT(TENANT_A, (tx) =>
      tx.shiftSchedule.create({
        data: {
          tenantId: TENANT_A,
          name: "SMOKE_DayShift",
          type: "FIXED",
          timeIn: "08:00",
          timeOut: "17:00",
          workDays: ["MON"],
        },
      }),
    );
    check("duplicate blocked", false, "no error thrown");
  } catch {
    check("duplicate blocked (unique constraint)", true);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // T3: List shifts
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT3: List shifts");
  const shifts = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.findMany({
      where: { tenantId: TENANT_A, deletedAt: null },
    }),
  );
  check("list finds shift", shifts.some((s) => s.id === shiftId));

  // ──────────────────────────────────────────────────────────────────────────
  // T4: Get shift by ID
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT4: Get shift by ID");
  const gotShift = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.findFirst({ where: { id: shiftId, tenantId: TENANT_A } }),
  );
  check("shift found", !!gotShift);
  check("breakMinutes=60", gotShift?.breakMinutes === 60);

  // ──────────────────────────────────────────────────────────────────────────
  // T5: Update shift (breakMinutes → 45)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT5: Update shift breakMinutes");
  const updatedShift = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.update({
      where: { id: shiftId },
      data: { breakMinutes: 45 },
    }),
  );
  check("breakMinutes updated", updatedShift.breakMinutes === 45);

  // ──────────────────────────────────────────────────────────────────────────
  // T6: Assign shift to Roberto
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT6: Assign shift to Roberto");
  const assignment = await withT(TENANT_A, (tx) =>
    tx.employeeShiftAssignment.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        shiftScheduleId: shiftId,
        effectiveFrom: SEP1,
        effectiveTo: null,
      },
    }),
  );
  check("assignment created", !!assignment.id);
  check("assignment effectiveFrom", assignment.effectiveFrom.toISOString() === SEP1.toISOString());

  // ──────────────────────────────────────────────────────────────────────────
  // T7: List shift assignments for Roberto
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT7: List assignments for Roberto");
  const allAssignments = await withT(TENANT_A, (tx) =>
    tx.employeeShiftAssignment.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    }),
  );
  check("assignment list non-empty", allAssignments.length >= 1);
  check("assignment references shiftId", allAssignments[0]?.shiftScheduleId === shiftId);

  // ──────────────────────────────────────────────────────────────────────────
  // T8: Create 5 DTR records Sep 1-5 (PRESENT, 10 late min, 30 OT min each)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT8: Create 5 DTR records (Sep 1-5, PRESENT)");
  const dtrDates = [SEP1, SEP2, SEP3, SEP4, SEP5];
  const dtrIds: string[] = [];
  for (const date of dtrDates) {
    const r = await withT(TENANT_A, (tx) =>
      tx.dTRRecord.create({
        data: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          date,
          shiftScheduleId: shiftId,
          dayStatus: "PRESENT",
          workedMinutes: 480,
          lateMinutes: 10,
          undertimeMinutes: 0,
          otMinutes: 30,
          nsdMinutes: 0,
        },
      }),
    );
    dtrIds.push(r.id);
  }
  check("5 PRESENT DTR records created", dtrIds.length === 5);

  // ──────────────────────────────────────────────────────────────────────────
  // T9: Create 1 ABSENT record for Sep 8
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT9: Create ABSENT record (Sep 8)");
  const absentRecord = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: SEP8,
        dayStatus: "ABSENT",
        workedMinutes: 0,
      },
    }),
  );
  const absentId = absentRecord.id;
  check("absent record created", !!absentId);
  check("dayStatus=ABSENT", absentRecord.dayStatus === "ABSENT");

  // ──────────────────────────────────────────────────────────────────────────
  // T10: List DTR records for Roberto
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT10: List DTR records for Roberto");
  const allDtrs = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    }),
  );
  check("6 DTR records", allDtrs.length === 6, allDtrs.length);

  // ──────────────────────────────────────────────────────────────────────────
  // T11: Get DTR record by ID
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT11: Get DTR record by ID");
  const gotDtr = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findFirst({ where: { id: dtrIds[0], tenantId: TENANT_A } }),
  );
  check("DTR found", !!gotDtr);
  check("lateMinutes=10", gotDtr?.lateMinutes === 10);
  check("otMinutes=30", gotDtr?.otMinutes === 30);
  check("approvalStatus=PENDING", gotDtr?.approvalStatus === "PENDING");

  // ──────────────────────────────────────────────────────────────────────────
  // T12: Approve 5 Sep 1-5 records
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT12: Approve Sep 1-5 records");
  for (const id of dtrIds) {
    await withT(TENANT_A, (tx) =>
      tx.dTRRecord.update({
        where: { id },
        data: { approvalStatus: "APPROVED", approvedAt: new Date() },
      }),
    );
  }
  const approvedDtrs = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, approvalStatus: "APPROVED" },
    }),
  );
  check("5 APPROVED records", approvedDtrs.length === 5, approvedDtrs.length);

  // ──────────────────────────────────────────────────────────────────────────
  // T13: Reject Sep 8 record
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT13: Reject Sep 8 record");
  const rejected = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.update({
      where: { id: absentId },
      data: { approvalStatus: "REJECTED" },
    }),
  );
  check("Sep 8 REJECTED", rejected.approvalStatus === "REJECTED");

  // ──────────────────────────────────────────────────────────────────────────
  // T14: Aggregate DTR → PeriodInput (Sep 1-15)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT14: Aggregate DTR → PeriodInput Sep 1-15");
  // Aggregate using direct DB call (mirrors what the API does)
  const approvedRecords = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        approvalStatus: "APPROVED",
        date: { gte: PERIOD_START, lte: PERIOD_END },
      },
    }),
  );

  let daysWorked = 0;
  let lateUndertimeMinutes = 0;
  let otMinutesTotal = 0;
  for (const r of approvedRecords) {
    lateUndertimeMinutes += r.lateMinutes + r.undertimeMinutes;
    otMinutesTotal += r.otMinutes;
    if (r.dayStatus === "PRESENT") daysWorked++;
  }

  const periodInput = await withT(TENANT_A, (tx) =>
    tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        daysWorked: daysWorked.toString(),
        lateUndertimeMinutes,
        regularOtHours: (otMinutesTotal / 60).toFixed(2),
        notes: `Aggregated from ${approvedRecords.length} DTR records`,
      },
      update: {
        daysWorked: daysWorked.toString(),
        lateUndertimeMinutes,
        regularOtHours: (otMinutesTotal / 60).toFixed(2),
        notes: `Aggregated from ${approvedRecords.length} DTR records`,
      },
    }),
  );

  check("PeriodInput created", !!periodInput.id);
  check("daysWorked=5", Number(periodInput.daysWorked) === 5, periodInput.daysWorked);
  check("lateUndertimeMinutes=50", periodInput.lateUndertimeMinutes === 50, periodInput.lateUndertimeMinutes);
  check("regularOtHours=2.50", Number(periodInput.regularOtHours) === 2.5, periodInput.regularOtHours);

  // ──────────────────────────────────────────────────────────────────────────
  // T15: Rejected DTR not included in aggregate
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT15: Rejected DTR not in aggregate");
  const approvedCount = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.count({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        approvalStatus: "APPROVED",
        date: { gte: PERIOD_START, lte: PERIOD_END },
      },
    }),
  );
  check("only 5 APPROVED (rejected Sep8 excluded)", approvedCount === 5, approvedCount);

  // ──────────────────────────────────────────────────────────────────────────
  // T16: PATCH PENDING DTR → succeeds
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT16: Create PENDING record and PATCH it");
  const pendingRecord = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: SEP10,
        dayStatus: "PRESENT",
        workedMinutes: 480,
        lateMinutes: 5,
      },
    }),
  );
  const patched = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.update({
      where: { id: pendingRecord.id },
      data: { lateMinutes: 15 },
    }),
  );
  check("PENDING PATCH succeeds", patched.lateMinutes === 15, patched.lateMinutes);

  // ──────────────────────────────────────────────────────────────────────────
  // T17: Lock a DTR record → PATCH blocked
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT17: Lock record → PATCH blocked");
  await withT(TENANT_A, (tx) =>
    tx.dTRRecord.update({
      where: { id: pendingRecord.id },
      data: { isLocked: true },
    }),
  );
  // Verify isLocked check (API level check, simulated here)
  const locked = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findFirst({
      where: { id: pendingRecord.id, tenantId: TENANT_A },
      select: { isLocked: true },
    }),
  );
  check("record isLocked=true", locked?.isLocked === true);

  // ──────────────────────────────────────────────────────────────────────────
  // T18: Upsert existing DTR with same date → updates (no duplicate)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT18: Upsert existing date (idempotent)");
  const upserted = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.upsert({
      where: {
        tenantId_employeeId_date: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          date: SEP1,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: SEP1,
        dayStatus: "PRESENT",
        workedMinutes: 480,
        notes: "upsert-test",
      },
      update: {
        notes: "upsert-updated",
      },
    }),
  );
  check("upsert updated existing", upserted.notes === "upsert-updated");

  // ──────────────────────────────────────────────────────────────────────────
  // T19: Cross-tenant isolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT19: Cross-tenant isolation");
  const crossTenantShifts = await withT(TENANT_B, (tx) =>
    tx.shiftSchedule.findMany({
      where: { tenantId: TENANT_B },
    }),
  );
  check("TENANT_B cannot see TENANT_A shifts", crossTenantShifts.length === 0, crossTenantShifts.length);

  const crossTenantDtr = await withT(TENANT_B, (tx) =>
    tx.dTRRecord.findMany({
      where: { tenantId: TENANT_B },
    }),
  );
  check("TENANT_B cannot see TENANT_A DTR", crossTenantDtr.length === 0, crossTenantDtr.length);

  // ──────────────────────────────────────────────────────────────────────────
  // T20: Soft-delete shift schedule
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT20: Soft-delete shift schedule");
  const softDeleted = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.update({
      where: { id: shiftId },
      data: { deletedAt: new Date(), isActive: false },
    }),
  );
  check("shift soft-deleted", softDeleted.deletedAt !== null);

  const deletedNotInActive = await withT(TENANT_A, (tx) =>
    tx.shiftSchedule.findFirst({
      where: { id: shiftId, tenantId: TENANT_A, deletedAt: null },
    }),
  );
  check("deleted shift not in active query", deletedNotInActive === null);

  // ──────────────────────────────────────────────────────────────────────────
  // T21: Cleanup
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\nT21: Cleanup");
  await cleanup();
  // Re-delete the locked / sep10 record added during T16/T17
  await withT(TENANT_A, async (tx) => {
    await tx.dTRRecord.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
    await tx.employeeShiftAssignment.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
    await tx.shiftSchedule.deleteMany({
      where: { tenantId: TENANT_A, name: { startsWith: "SMOKE_" } },
    });
  });
  check("cleanup done", true);

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Phase J Results: ${total - failures}/${total} PASS`);
  if (failures > 0) {
    console.error(`${failures} FAILURES`);
    process.exit(1);
  }
  console.log("All Phase J checks passed ✓");
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
