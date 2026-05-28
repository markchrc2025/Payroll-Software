/**
 * smoke-f2.ts — Phase F2: FINAL_PAY Run Type
 *
 * Tests:
 *  T1. FINAL_PAY + REDUNDANCY → backPay, prorated13th, leaveCashOut, sepPay,
 *      isSepPayTaxable=false, wht≥0, net identity
 *  T2. FINAL_PAY + RESIGNATION → sepPay=0 (voluntary, no DOLE entitlement)
 *  T3. recomputeRun preserves separationReason + recalculates correctly
 *  T4. finalizeRun on FINAL_PAY book → status=FINALIZED
 *  T5. Cleanup
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  recomputeRun,
  finalizeRun,
} from "../src/lib/payroll/persist.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu";

// FINAL_PAY period: July 1-31 2026 (MONTHLY or SEMI_MONTHLY last period).
const FP_START = new Date("2026-07-01T00:00:00.000Z");
const FP_END   = new Date("2026-07-31T00:00:00.000Z");

// Period for a fake prior FINALIZED REGULAR run (June 2026) — for CY prior WHT.
const PRIOR_START = new Date("2026-06-01T00:00:00.000Z");
const PRIOR_END   = new Date("2026-06-30T00:00:00.000Z");

let failures = 0;
let total = 0;
function check(label: string, cond: boolean, detail?: string) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
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

// ---------------------------------------------------------------------------
// Seed / cleanup helpers
// ---------------------------------------------------------------------------

async function seedPeriodInput() {
  await withT(TENANT_A, async (tx) => {
    await tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          periodStart: FP_START,
          periodEnd: FP_END,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: FP_START,
        periodEnd: FP_END,
        daysWorked: 22,
      },
      update: { daysWorked: 22 },
    });
  });
}

/** Ensures Roberto has a convertible-to-cash leave type + balance (5 days). */
async function seedLeaveBalance() {
  await withT(TENANT_A, async (tx) => {
    // Upsert a convertible leave type.
    const lt = await tx.leaveType.upsert({
      where: { tenantId_code: { tenantId: TENANT_A, code: "SL_CASH_F2" } },
      create: {
        tenantId: TENANT_A,
        code: "SL_CASH_F2",
        name: "Sick Leave (Cashable) F2",
        isConvertibleToCash: true,
        accrualAmount: 1.0,
      },
      update: { isConvertibleToCash: true },
    });

    // Upsert leave balance: 5 days available in 2026.
    await tx.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: ROBERTO_ID,
          leaveTypeId: lt.id,
          year: 2026,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId: lt.id,
        year: 2026,
        openingBalance: 5,
        earned: 0,
        used: 0,
        forfeited: 0,
        convertedToCash: 0,
      },
      update: { openingBalance: 5, earned: 0, used: 0, forfeited: 0, convertedToCash: 0 },
    });
  });
}

/** Sets Roberto's lastWorkingDate to July 31, 2026 (returns to null on cleanup). */
async function setLastWorkingDate(date: Date | null) {
  await withT(TENANT_A, async (tx) => {
    await tx.employee.update({
      where: { id: ROBERTO_ID },
      data: { lastWorkingDate: date },
    });
  });
}

/**
 * Creates + finalizes a REGULAR run for Roberto in June 2026 so there is CY
 * prior taxable income / WHT for the annualisation test.  Returns the bookId.
 */
async function seedPriorFinalizedRun(): Promise<string> {
  // Seed period input for June.
  await withT(TENANT_A, async (tx) => {
    await tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          periodStart: PRIOR_START,
          periodEnd: PRIOR_END,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: PRIOR_START,
        periodEnd: PRIOR_END,
        daysWorked: 21,
      },
      update: { daysWorked: 21 },
    });
  });

  // Check if a finalized REGULAR run for June already exists (from prior smoke tests).
  const existing = await withT(TENANT_A, async (tx) => {
    return tx.payrollBook.findFirst({
      where: {
        tenantId: TENANT_A,
        periodStart: PRIOR_START,
        periodEnd: PRIOR_END,
        runType: "REGULAR",
        status: "FINALIZED",
      },
    });
  });
  if (existing) return existing.id;

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PRIOR_START,
    periodEnd: PRIOR_END,
    cycle: "MONTHLY",
    runType: "REGULAR",
    employeeIds: [ROBERTO_ID],
  });
  const finalized = await finalizeRun(TENANT_A, book.id, null);
  return finalized.id;
}

async function cleanup(priorBookId: string) {
  await withT(TENANT_A, async (tx) => {
    // Remove FINAL_PAY books.
    const books = await tx.payrollBook.findMany({
      where: {
        tenantId: TENANT_A,
        periodStart: FP_START,
        periodEnd: FP_END,
        runType: "FINAL_PAY",
      },
    });
    for (const b of books) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }

    // Remove seeded prior REGULAR run (if we created it).
    const priorBook = await tx.payrollBook.findUnique({
      where: { id: priorBookId },
    });
    if (priorBook && priorBook.status === "FINALIZED") {
      // Delete sheets + audit + book (safe because this was seeded by smoke).
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: priorBookId } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: priorBookId },
      });
      // Only delete if runType=REGULAR and period matches (guard against wrong id).
      if (
        priorBook.runType === "REGULAR" &&
        priorBook.periodStart.getTime() === PRIOR_START.getTime() &&
        priorBook.periodEnd.getTime() === PRIOR_END.getTime()
      ) {
        await tx.payrollBook.delete({ where: { id: priorBookId } });
      }
    }

    // Remove seeded period inputs.
    await tx.periodInput.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: { in: [FP_START, PRIOR_START] },
      },
    });

    // Remove seeded leave balance + leave type.
    const lt = await tx.leaveType.findUnique({
      where: { tenantId_code: { tenantId: TENANT_A, code: "SL_CASH_F2" } },
    });
    if (lt) {
      await tx.leaveBalance.deleteMany({
        where: { tenantId: TENANT_A, leaveTypeId: lt.id },
      });
      await tx.leaveType.delete({ where: { id: lt.id } });
    }
  });
}

// ---------------------------------------------------------------------------
// T1: FINAL_PAY + REDUNDANCY
// ---------------------------------------------------------------------------
async function test1(): Promise<string> {
  console.log("\n[T1] FINAL_PAY + REDUNDANCY");

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: FP_START,
    periodEnd: FP_END,
    cycle: "MONTHLY",
    runType: "FINAL_PAY",
    employeeIds: [ROBERTO_ID],
    separationReason: "REDUNDANCY",
  });

  check("T1a. 1 sheet created", book.sheets.length === 1, String(book.sheets.length));
  check("T1b. runType = FINAL_PAY", book.runType === "FINAL_PAY");
  check("T1c. separationReason = REDUNDANCY", book.separationReason === "REDUNDANCY");

  const sheet = book.sheets[0]!;
  check("T1d. basePayCents > 0", sheet.basePayCents > 0n, String(sheet.basePayCents));

  // finalPayBreakdown should be set.
  const bd = sheet.finalPayBreakdown as null | Record<string, unknown>;
  check("T1e. finalPayBreakdown present", bd !== null && bd !== undefined);

  if (bd) {
    const p13th = BigInt(bd.proratedThirteenthMonthCents as string);
    check("T1f. proratedThirteenthMonthCents ≥ 0", p13th >= 0n, String(p13th));

    const lcash = BigInt(bd.leaveCashOutCents as string);
    check("T1g. leaveCashOutCents > 0 (5 days seeded)", lcash > 0n, String(lcash));

    const sepPay = BigInt(bd.separationPayCents as string);
    check("T1h. separationPayCents > 0 (REDUNDANCY)", sepPay > 0n, String(sepPay));

    check("T1i. isSeparationPayTaxable = false (DOLE-mandated)", bd.isSeparationPayTaxable === false);
  }

  check("T1j. withholdingTaxCents ≥ 0", sheet.withholdingTaxCents >= 0n, String(sheet.withholdingTaxCents));
  check("T1k. netPayCents > 0", sheet.netPayCents > 0n, String(sheet.netPayCents));

  // Net identity: net = gross + nontaxableAdditions - (sss+phic+hdmf) - wht - loans
  const netCheck =
    sheet.grossCompensationCents +
    sheet.nontaxableAdditionsCents -
    sheet.sssEeCents -
    sheet.philhealthEeCents -
    sheet.pagibigEeCents -
    sheet.withholdingTaxCents -
    sheet.loanDeductionsCents;
  check("T1l. net identity holds", sheet.netPayCents === netCheck,
    `sheet=${sheet.netPayCents} calc=${netCheck}`);

  // Cleanup T1 book (leave T2/T3 period clean for next test).
  await withT(TENANT_A, async (tx) => {
    await tx.payrollSheet.deleteMany({ where: { payrollBookId: book.id } });
    await tx.payrollBook.delete({ where: { id: book.id } });
  });

  return book.id;
}

// ---------------------------------------------------------------------------
// T2: FINAL_PAY + RESIGNATION → sepPay = 0
// ---------------------------------------------------------------------------
async function test2(): Promise<string> {
  console.log("\n[T2] FINAL_PAY + RESIGNATION (voluntary — no DOLE sep pay)");

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: FP_START,
    periodEnd: FP_END,
    cycle: "MONTHLY",
    runType: "FINAL_PAY",
    employeeIds: [ROBERTO_ID],
    separationReason: "RESIGNATION",
  });

  check("T2a. 1 sheet created", book.sheets.length === 1, String(book.sheets.length));
  check("T2b. separationReason = RESIGNATION", book.separationReason === "RESIGNATION");

  const sheet = book.sheets[0]!;
  const bd = sheet.finalPayBreakdown as null | Record<string, unknown>;
  check("T2c. finalPayBreakdown present", bd !== null);

  if (bd) {
    const sepPay = BigInt(bd.separationPayCents as string);
    check("T2d. separationPayCents = 0 (no DOLE entitlement)", sepPay === 0n, String(sepPay));
  }

  check("T2e. withholdingTaxCents ≥ 0", sheet.withholdingTaxCents >= 0n);
  check("T2f. basePayCents > 0", sheet.basePayCents > 0n);

  return book.id;
}

// ---------------------------------------------------------------------------
// T3: recomputeRun preserves separationReason + recalculates
// ---------------------------------------------------------------------------
async function test3(bookId: string): Promise<void> {
  console.log("\n[T3] recomputeRun preserves separationReason=RESIGNATION");

  const book = await recomputeRun(TENANT_A, bookId);

  check("T3a. separationReason still RESIGNATION", book.separationReason === "RESIGNATION");
  // recomputeRun fans out to all active employees (no stored employeeIds filter);
  // find Roberto's sheet explicitly.
  const sheet = book.sheets.find((s) => s.employeeId === ROBERTO_ID);
  check("T3b. Roberto sheet present after recompute", sheet !== undefined);

  const bd = sheet?.finalPayBreakdown as null | Record<string, unknown>;
  check("T3c. finalPayBreakdown still present", bd !== null && bd !== undefined);

  if (bd) {
    const sepPay = BigInt(bd.separationPayCents as string);
    check("T3d. separationPayCents still 0 after recompute", sepPay === 0n);
  }

  check("T3e. basePayCents > 0", (sheet?.basePayCents ?? 0n) > 0n);
}

// ---------------------------------------------------------------------------
// T4: finalizeRun on FINAL_PAY book
// ---------------------------------------------------------------------------
async function test4(bookId: string): Promise<void> {
  console.log("\n[T4] finalizeRun on FINAL_PAY book");

  const book = await finalizeRun(TENANT_A, bookId, null);
  check("T4a. status = FINALIZED", book.status === "FINALIZED");
  check("T4b. separationReason preserved after finalize", book.separationReason === "RESIGNATION");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== smoke-f2: FINAL_PAY Run Type ===\n");
  let priorBookId = "";
  try {
    // Pre-clean any leftover data.
    await setLastWorkingDate(null);
    await cleanup("__none__");

    // Seed.
    await seedPeriodInput();
    await seedLeaveBalance();
    await setLastWorkingDate(new Date("2026-07-31T00:00:00.000Z"));
    priorBookId = await seedPriorFinalizedRun();

    // Run tests.
    await test1();
    const bookId = await test2();
    await test3(bookId);
    await test4(bookId);
  } catch (e) {
    console.error("\nUnhandled error:", e);
    failures += 1;
  } finally {
    // Restore employee + cleanup DB.
    await setLastWorkingDate(null).catch(() => {});
    await cleanup(priorBookId).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(`\n=== Results: ${total - failures}/${total} passed ===\n`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
