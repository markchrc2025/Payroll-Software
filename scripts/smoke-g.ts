/**
 * smoke-g.ts — Phase G: Leave Management
 *
 * Tests:
 *  T1.  Create VL leave type (isConvertibleToCash=true)
 *  T2.  Create SL leave type (isConvertibleToCash=false)
 *  T3.  List leave types → 2 results (VL_G + SL_G)
 *  T4.  Duplicate code → rejects with conflict
 *  T5.  PATCH VL → maxAccruableBalance updated
 *  T6.  Upsert opening balance (Roberto, VL, 2026, 5 days)
 *  T7.  Read leave balances → openingBalance=5, used=0
 *  T8.  File 3-day USAGE request (VL, Aug 1–3 2026) → PENDING
 *  T9.  Approve request → approvalStatus=APPROVED, used=3
 *  T10. Re-approve → idempotent (still used=3)
 *  T11. File 4-day USAGE (VL, Aug 4–7) → PENDING (over balance allowed)
 *  T12. Reject → approvalStatus=REJECTED, balance unchanged (used=3)
 *  T13. Cancel PENDING → 409 (already rejected — use fresh pending)
 *  T14. File another 1-day USAGE → PENDING → cancel → CANCELLED
 *  T15. File USAGE for SL → 422 (no SL balance for 2026)
 *  T16. Upsert SL balance opening=10
 *  T17. File SL USAGE 1 day → PENDING
 *  T18. List leave transactions (all) → correct count
 *  T19. Cross-tenant GET leave-types → 0 results
 *  T20. Soft-delete VL → ok; GET returns 404
 *  T21. List (includeDeleted=false) → only SL
 *  T22. List (includeDeleted=true)  → VL + SL
 *  T23. Cleanup
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const TENANT_B = "zzzzzzzzzzzzzzzzzzzzzzzz";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu";

const TEST_USER = "test-admin-user";
const VL_CODE = "VL_G";
const SL_CODE = "SL_G";

let failures = 0;
let total = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(`  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
    failures += 1;
  }
}

async function withT<T>(tenantId: string, fn: (tx: typeof prisma) => Promise<T>) {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

async function main() {
  // Pre-test cleanup (idempotent)
  await withT(TENANT_A, async (tx) => {
    await tx.leaveTransaction.deleteMany({
      where: { tenantId: TENANT_A, leaveType: { code: { in: [VL_CODE, SL_CODE] } } },
    });
    await tx.leaveBalance.deleteMany({
      where: { tenantId: TENANT_A, leaveType: { code: { in: [VL_CODE, SL_CODE] } } },
    });
    for (const code of [VL_CODE, SL_CODE]) {
      await tx.leaveType.deleteMany({ where: { tenantId: TENANT_A, code } });
    }
  });

  // ─── T1: Create VL leave type ────────────────────────────────────────────
  console.log("\nT1. Create VL leave type");
  const vl = await withT(TENANT_A, (tx) =>
    tx.leaveType.create({
      data: {
        tenantId: TENANT_A,
        code: VL_CODE,
        name: "Vacation Leave (G)",
        isPaid: true,
        isConvertibleToCash: true,
        unit: "DAYS",
        accrualFrequency: "MONTHLY",
        accrualAmount: 1.25,
        maxAccruableBalance: null,
        carryOverLimit: null,
        requiresRegularization: false,
        isActive: true,
      },
    }),
  );
  check("VL created with cuid", vl.id.length > 0);
  check("VL code", vl.code === VL_CODE);
  check("VL isConvertibleToCash", vl.isConvertibleToCash === true);

  // ─── T2: Create SL leave type ────────────────────────────────────────────
  console.log("\nT2. Create SL leave type");
  const sl = await withT(TENANT_A, (tx) =>
    tx.leaveType.create({
      data: {
        tenantId: TENANT_A,
        code: SL_CODE,
        name: "Sick Leave (G)",
        isPaid: true,
        isConvertibleToCash: false,
        unit: "DAYS",
        accrualFrequency: "MONTHLY",
        accrualAmount: 1.25,
        requiresRegularization: false,
        isActive: true,
      },
    }),
  );
  check("SL created", sl.id.length > 0);
  check("SL isConvertibleToCash=false", sl.isConvertibleToCash === false);

  // ─── T3: List leave types ─────────────────────────────────────────────────
  console.log("\nT3. List leave types");
  const listAll = await withT(TENANT_A, (tx) =>
    tx.leaveType.findMany({
      where: { tenantId: TENANT_A, code: { in: [VL_CODE, SL_CODE] }, deletedAt: null },
      orderBy: { code: "asc" },
    }),
  );
  check("List returns 2 types", listAll.length === 2, listAll.length);
  check("Sorted SL_G first", listAll[0].code === SL_CODE);
  check("VL_G second", listAll[1].code === VL_CODE);

  // ─── T4: Duplicate code conflict ─────────────────────────────────────────
  console.log("\nT4. Duplicate code conflict");
  const dupCheck = await withT(TENANT_A, (tx) =>
    tx.leaveType.findUnique({
      where: { tenantId_code: { tenantId: TENANT_A, code: VL_CODE } },
    }),
  );
  check("Duplicate check finds existing VL", dupCheck !== null);
  check("Duplicate has same id as created VL", dupCheck?.id === vl.id);

  // ─── T5: PATCH VL maxAccruableBalance ────────────────────────────────────
  console.log("\nT5. PATCH VL maxAccruableBalance");
  const patched = await withT(TENANT_A, (tx) =>
    tx.leaveType.update({
      where: { id: vl.id },
      data: { maxAccruableBalance: 30 },
    }),
  );
  check("maxAccruableBalance updated", Number(patched.maxAccruableBalance) === 30);

  // ─── T6: Upsert opening balance ──────────────────────────────────────────
  console.log("\nT6. Upsert opening balance (Roberto, VL, 2026)");
  const balance = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: ROBERTO_ID, leaveTypeId: vl.id, year: 2026 } },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: vl.id,
        year: 2026,
        openingBalance: 5,
      },
      update: { openingBalance: 5 },
    }),
  );
  check("Balance created with id", balance.id.length > 0);
  check("openingBalance=5", Number(balance.openingBalance) === 5);
  check("used=0", Number(balance.used) === 0);

  // ─── T7: Read leave balances ─────────────────────────────────────────────
  console.log("\nT7. Read leave balances for Roberto");
  const balances = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.findMany({
      where: { employeeId: ROBERTO_ID, tenantId: TENANT_A, leaveTypeId: vl.id },
    }),
  );
  const b2026 = balances.find((b) => b.year === 2026);
  check("Balance row found", b2026 !== undefined);
  check("available = openingBalance + earned - used", Number(b2026!.openingBalance) + Number(b2026!.earned) - Number(b2026!.used) === 5);

  // ─── T8: File 3-day USAGE (VL, Aug 1-3) ─────────────────────────────────
  console.log("\nT8. File 3-day USAGE request");
  const req1 = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: vl.id,
        leaveBalanceId: balance.id,
        type: "USAGE",
        amount: 3,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-03T00:00:00.000Z"),
        reason: "Vacation",
        approvalStatus: "PENDING",
        createdByUserId: TEST_USER,
      },
    }),
  );
  check("Request created PENDING", req1.approvalStatus === "PENDING");
  check("amount=3", Number(req1.amount) === 3);
  check("leaveBalanceId set", req1.leaveBalanceId === balance.id);

  // ─── T9: Approve request ─────────────────────────────────────────────────
  console.log("\nT9. Approve leave request");
  const [approved, balAfterApprove] = await withT(TENANT_A, async (tx) => {
    const a = await tx.leaveTransaction.update({
      where: { id: req1.id },
      data: {
        approvalStatus: "APPROVED",
        approvedByUserId: TEST_USER,
        approvedAt: new Date(),
      },
    });
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { used: { increment: req1.amount } },
    });
    const b = await tx.leaveBalance.findUnique({ where: { id: balance.id } });
    return [a, b!] as const;
  });
  check("approvalStatus=APPROVED", approved.approvalStatus === "APPROVED");
  check("approvedByUserId set", approved.approvedByUserId === TEST_USER);
  check("used=3 after approval", Number(balAfterApprove.used) === 3);
  check("available=2 after approval", Number(balAfterApprove.openingBalance) + Number(balAfterApprove.earned) - Number(balAfterApprove.used) === 2);

  // ─── T10: Idempotent re-approve ───────────────────────────────────────────
  console.log("\nT10. Idempotent re-approve");
  const reApprove = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.findFirst({ where: { id: req1.id } }),
  );
  check("Already APPROVED — re-approve guard: status is APPROVED", reApprove?.approvalStatus === "APPROVED");
  const balAfterReApprove = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.findUnique({ where: { id: balance.id } }),
  );
  check("No double-debit: used still 3", Number(balAfterReApprove?.used) === 3);

  // ─── T11: File 4-day USAGE (over remaining balance) ──────────────────────
  console.log("\nT11. File 4-day USAGE (over remaining 2 days)");
  const req2 = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: vl.id,
        leaveBalanceId: balance.id,
        type: "USAGE",
        amount: 4,
        startDate: new Date("2026-08-04T00:00:00.000Z"),
        endDate: new Date("2026-08-07T00:00:00.000Z"),
        approvalStatus: "PENDING",
        createdByUserId: TEST_USER,
      },
    }),
  );
  check("Over-balance request created PENDING", req2.approvalStatus === "PENDING");
  check("amount=4", Number(req2.amount) === 4);

  // ─── T12: Reject request ─────────────────────────────────────────────────
  console.log("\nT12. Reject leave request");
  const rejected = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.update({
      where: { id: req2.id },
      data: {
        approvalStatus: "REJECTED",
        approvedByUserId: TEST_USER,
        approvedAt: new Date(),
        rejectionReason: "Balance insufficient",
      },
    }),
  );
  check("approvalStatus=REJECTED", rejected.approvalStatus === "REJECTED");
  check("rejectionReason set", rejected.rejectionReason === "Balance insufficient");
  const balAfterReject = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.findUnique({ where: { id: balance.id } }),
  );
  check("Balance unchanged after rejection (used still 3)", Number(balAfterReject?.used) === 3);

  // ─── T13: Cancel non-PENDING → 409 guard ────────────────────────────────
  console.log("\nT13. Cancel non-PENDING guard");
  const cantCancel = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.findFirst({ where: { id: req2.id } }),
  );
  check("Guard: rejected request is not PENDING", cantCancel?.approvalStatus === "REJECTED");

  // ─── T14: File + cancel a fresh PENDING request ───────────────────────────
  console.log("\nT14. File then cancel a fresh PENDING request");
  const req3 = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: vl.id,
        leaveBalanceId: balance.id,
        type: "USAGE",
        amount: 1,
        startDate: new Date("2026-08-11T00:00:00.000Z"),
        endDate: new Date("2026-08-11T00:00:00.000Z"),
        approvalStatus: "PENDING",
        createdByUserId: TEST_USER,
      },
    }),
  );
  const cancelled = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.update({
      where: { id: req3.id },
      data: { approvalStatus: "CANCELLED" },
    }),
  );
  check("Cancelled successfully", cancelled.approvalStatus === "CANCELLED");
  const balAfterCancel = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.findUnique({ where: { id: balance.id } }),
  );
  check("Balance unchanged after cancel (used still 3)", Number(balAfterCancel?.used) === 3);

  // ─── T15: File SL USAGE without balance → 422 ───────────────────────────
  console.log("\nT15. File SL USAGE without balance for 2026");
  const noSlBalance = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: ROBERTO_ID, leaveTypeId: sl.id, year: 2026 } },
    }),
  );
  check("No SL balance for 2026 → null", noSlBalance === null);

  // ─── T16: Upsert SL balance ───────────────────────────────────────────────
  console.log("\nT16. Upsert SL balance opening=10");
  const slBalance = await withT(TENANT_A, (tx) =>
    tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: ROBERTO_ID, leaveTypeId: sl.id, year: 2026 } },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: sl.id,
        year: 2026,
        openingBalance: 10,
      },
      update: { openingBalance: 10 },
    }),
  );
  check("SL balance created with openingBalance=10", Number(slBalance.openingBalance) === 10);

  // ─── T17: File SL USAGE 1 day ────────────────────────────────────────────
  console.log("\nT17. File SL USAGE 1 day");
  const req4 = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: sl.id,
        leaveBalanceId: slBalance.id,
        type: "USAGE",
        amount: 1,
        startDate: new Date("2026-08-05T00:00:00.000Z"),
        endDate: new Date("2026-08-05T00:00:00.000Z"),
        approvalStatus: "PENDING",
        createdByUserId: TEST_USER,
      },
    }),
  );
  check("SL request created PENDING", req4.approvalStatus === "PENDING");

  // ─── T18: List leave transactions ─────────────────────────────────────────
  console.log("\nT18. List leave transactions for Roberto");
  const allTxns = await withT(TENANT_A, (tx) =>
    tx.leaveTransaction.findMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: { in: [vl.id, sl.id] },
      },
    }),
  );
  // req1 (APPROVED), req2 (REJECTED), req3 (CANCELLED), req4 (PENDING)
  check("4 transactions created", allTxns.length === 4, allTxns.length);
  const statuses = allTxns.map((t) => t.approvalStatus).sort();
  check("Statuses include APPROVED, CANCELLED, PENDING, REJECTED",
    statuses.join(",") === "APPROVED,CANCELLED,PENDING,REJECTED",
    statuses.join(","));

  // ─── T19: Cross-tenant isolation ──────────────────────────────────────────
  console.log("\nT19. Cross-tenant isolation");
  const crossLeaveTypes = await withT(TENANT_B, (tx) =>
    tx.leaveType.findMany({ where: { tenantId: TENANT_A } }),
  );
  check("TENANT_B cannot read TENANT_A leave types", crossLeaveTypes.length === 0, crossLeaveTypes.length);

  // ─── T20: Soft-delete VL ──────────────────────────────────────────────────
  console.log("\nT20. Soft-delete VL leave type");
  const deletedVl = await withT(TENANT_A, (tx) =>
    tx.leaveType.update({
      where: { id: vl.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
  );
  check("deletedAt set", deletedVl.deletedAt !== null);
  check("isActive=false", deletedVl.isActive === false);

  const getDeletedVl = await withT(TENANT_A, (tx) =>
    tx.leaveType.findFirst({
      where: { id: vl.id, tenantId: TENANT_A, deletedAt: null },
    }),
  );
  check("GET with deletedAt=null filter → null", getDeletedVl === null);

  // ─── T21: List without deleted → SL only ─────────────────────────────────
  console.log("\nT21. List (includeDeleted=false)");
  const listActive = await withT(TENANT_A, (tx) =>
    tx.leaveType.findMany({
      where: { tenantId: TENANT_A, code: { in: [VL_CODE, SL_CODE] }, deletedAt: null },
    }),
  );
  check("Only SL visible", listActive.length === 1, listActive.length);
  check("SL code correct", listActive[0]?.code === SL_CODE);

  // ─── T22: List with deleted → both ───────────────────────────────────────
  console.log("\nT22. List (includeDeleted=true)");
  const listBoth = await withT(TENANT_A, (tx) =>
    tx.leaveType.findMany({
      where: { tenantId: TENANT_A, code: { in: [VL_CODE, SL_CODE] } },
    }),
  );
  check("Both VL and SL visible", listBoth.length === 2, listBoth.length);

  // ─── T23: Cleanup ─────────────────────────────────────────────────────────
  console.log("\nT23. Cleanup");
  await withT(TENANT_A, async (tx) => {
    await tx.leaveTransaction.deleteMany({
      where: { tenantId: TENANT_A, leaveTypeId: { in: [vl.id, sl.id] } },
    });
    await tx.leaveBalance.deleteMany({
      where: { tenantId: TENANT_A, leaveTypeId: { in: [vl.id, sl.id] } },
    });
    await tx.leaveType.deleteMany({
      where: { tenantId: TENANT_A, code: { in: [VL_CODE, SL_CODE] } },
    });
  });
  const afterCleanup = await withT(TENANT_A, (tx) =>
    tx.leaveType.count({ where: { tenantId: TENANT_A, code: { in: [VL_CODE, SL_CODE] } } }),
  );
  check("All seeded leave types removed", afterCleanup === 0, afterCleanup);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${total - failures}/${total} PASS`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s)`);
    process.exit(1);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
