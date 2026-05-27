/**
 * smoke-f1.ts — Phase F1: OFF_CYCLE Run Type
 *
 * Tests:
 *  1. OFF_CYCLE run with employeeIds=[ROBERTO] + skipStatutory=false
 *     a. 1 sheet created (filtered to Roberto only)
 *     b. runType = OFF_CYCLE
 *     c. skipStatutory = false on book
 *     d. statutoryDeductedSnapshot = true (SECOND_CUTOFF period, day>15)
 *     e. sssEeCents > 0
 *     f. philhealthEeCents > 0
 *     g. pagibigEeCents > 0
 *     h. withholdingTaxCents ≥ 0 (WHT computed normally)
 *  2. OFF_CYCLE run with employeeIds=[ROBERTO] + skipStatutory=true
 *     a. 1 sheet created
 *     b. skipStatutory = true on book
 *     c. statutoryDeductedSnapshot = false
 *     d. sssEeCents = 0n
 *     e. philhealthEeCents = 0n
 *     f. pagibigEeCents = 0n
 *     g. netPayCents > basePayCents - withholdingTaxCents - 1n
 *        (no statutory deductions from net)
 *     h. withholdingTaxCents ≥ 0 (WHT still applied)
 *  3. recomputeRun preserves skipStatutory (re-run #2, sheets same)
 *     a. after recompute: sssEeCents = 0n still
 *     b. skipStatutory still true on book
 *  4. finalizeRun works on skipStatutory=true book
 *     a. status = FINALIZED
 *  5. OFF_CYCLE run with no employeeIds → all 10 active employees get sheets
 *     a. sheets.length = 10
 *     b. Roberto sheet in result
 *  6. Cleanup
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

// July 16-31 2026: SEMI_MONTHLY SECOND_CUTOFF period (day≥16 → statutory deducted)
const OC_START = new Date("2026-07-16T00:00:00.000Z");
const OC_END   = new Date("2026-07-31T00:00:00.000Z");

// All-employees OFF_CYCLE uses a slightly different period to avoid unique-key
// conflict with the Roberto-only runs (same period+runType would conflict).
const OC2_START = new Date("2026-07-01T00:00:00.000Z");
const OC2_END   = new Date("2026-07-15T00:00:00.000Z");

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

async function seedPeriodInput(daysWorked: number) {
  // Upsert period input for Roberto on July 16-31 (needed for base pay).
  await withT(TENANT_A, async (tx) => {
    await tx.periodInput.upsert({
      where: {
        tenantId_employeeId_periodStart_periodEnd: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          periodStart: OC_START,
          periodEnd: OC_END,
        },
      },
      create: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: OC_START,
        periodEnd: OC_END,
        daysWorked,
      },
      update: { daysWorked },
    });
  });
}

async function cleanup() {
  await withT(TENANT_A, async (tx) => {
    // Remove all OFF_CYCLE books created in this smoke.
    for (const [s, e] of [
      [OC_START, OC_END],
      [OC2_START, OC2_END],
    ]) {
      const books = await tx.payrollBook.findMany({
        where: {
          tenantId: TENANT_A,
          periodStart: s,
          periodEnd: e,
          runType: "OFF_CYCLE",
        },
      });
      for (const b of books) {
        await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
        await tx.auditLog.deleteMany({
          where: { entity: "PayrollBook", entityId: b.id },
        });
        await tx.payrollBook.delete({ where: { id: b.id } });
      }
    }

    // Remove the seeded period input.
    await tx.periodInput.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: OC_START,
        periodEnd: OC_END,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Test 1: OFF_CYCLE, Roberto only, skipStatutory=false
// ---------------------------------------------------------------------------
async function test1(): Promise<void> {
  console.log("\n[T1] OFF_CYCLE + Roberto only + skipStatutory=false");

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: OC_START,
    periodEnd: OC_END,
    cycle: "SEMI_MONTHLY",
    runType: "OFF_CYCLE",
    employeeIds: [ROBERTO_ID],
    skipStatutory: false,
  });

  check("1a. 1 sheet created", book.sheets.length === 1, String(book.sheets.length));
  check("1b. runType = OFF_CYCLE", book.runType === "OFF_CYCLE");
  check("1c. skipStatutory = false on book", book.skipStatutory === false);

  const sheet = book.sheets[0]!;
  check("1d. statutoryDeductedSnapshot = true", sheet.statutoryDeductedSnapshot === true);
  check("1e. sssEeCents > 0", sheet.sssEeCents > 0n, String(sheet.sssEeCents));
  check("1f. philhealthEeCents > 0", sheet.philhealthEeCents > 0n, String(sheet.philhealthEeCents));
  check("1g. pagibigEeCents > 0", sheet.pagibigEeCents > 0n, String(sheet.pagibigEeCents));
  check("1h. withholdingTaxCents ≥ 0", sheet.withholdingTaxCents >= 0n, String(sheet.withholdingTaxCents));

  // Cleanup this book before next test.
  await withT(TENANT_A, async (tx) => {
    await tx.payrollSheet.deleteMany({ where: { payrollBookId: book.id } });
    await tx.payrollBook.delete({ where: { id: book.id } });
  });
}

// ---------------------------------------------------------------------------
// Test 2: OFF_CYCLE, Roberto only, skipStatutory=true
// ---------------------------------------------------------------------------
async function test2(): Promise<string> {
  console.log("\n[T2] OFF_CYCLE + Roberto only + skipStatutory=true");

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: OC_START,
    periodEnd: OC_END,
    cycle: "SEMI_MONTHLY",
    runType: "OFF_CYCLE",
    employeeIds: [ROBERTO_ID],
    skipStatutory: true,
  });

  check("2a. 1 sheet created", book.sheets.length === 1, String(book.sheets.length));
  check("2b. skipStatutory = true on book", book.skipStatutory === true);

  const sheet = book.sheets[0]!;
  check("2c. statutoryDeductedSnapshot = false", sheet.statutoryDeductedSnapshot === false);
  check("2d. sssEeCents = 0", sheet.sssEeCents === 0n, String(sheet.sssEeCents));
  check("2e. philhealthEeCents = 0", sheet.philhealthEeCents === 0n, String(sheet.philhealthEeCents));
  check("2f. pagibigEeCents = 0", sheet.pagibigEeCents === 0n, String(sheet.pagibigEeCents));
  check("2h. withholdingTaxCents ≥ 0", sheet.withholdingTaxCents >= 0n, String(sheet.withholdingTaxCents));

  // net = gross - wht (no statutory deductions)
  const expectedNet =
    sheet.grossCompensationCents - sheet.withholdingTaxCents - sheet.loanDeductionsCents;
  check(
    "2g. netPayCents = gross - wht - loans",
    sheet.netPayCents === expectedNet,
    `${sheet.netPayCents} vs ${expectedNet}`,
  );

  return book.id;
}

// ---------------------------------------------------------------------------
// Test 3: recomputeRun preserves skipStatutory
// ---------------------------------------------------------------------------
async function test3(bookId: string): Promise<void> {
  console.log("\n[T3] recomputeRun preserves skipStatutory=true");

  const book = await recomputeRun(TENANT_A, bookId);

  check("3a. skipStatutory still true after recompute", book.skipStatutory === true);
  const sheet = book.sheets[0]!;
  check("3b. sssEeCents still 0 after recompute", sheet.sssEeCents === 0n, String(sheet.sssEeCents));
  check("3c. statutoryDeductedSnapshot still false", sheet.statutoryDeductedSnapshot === false);
}

// ---------------------------------------------------------------------------
// Test 4: finalizeRun works on skipStatutory=true book
// ---------------------------------------------------------------------------
async function test4(bookId: string): Promise<void> {
  console.log("\n[T4] finalizeRun on skipStatutory=true book");

  const book = await finalizeRun(TENANT_A, bookId, null);
  check("4a. status = FINALIZED", book.status === "FINALIZED");
  check("4b. finalizedAt set", book.finalizedAt != null);
}

// ---------------------------------------------------------------------------
// Test 5: OFF_CYCLE, no employeeIds → all active employees
// ---------------------------------------------------------------------------
async function test5(): Promise<void> {
  console.log("\n[T5] OFF_CYCLE + no employeeIds → all active employees");

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: OC2_START,
    periodEnd: OC2_END,
    cycle: "SEMI_MONTHLY",
    runType: "OFF_CYCLE",
    skipStatutory: false,
  });

  check("5a. sheets.length = 10", book.sheets.length === 10, String(book.sheets.length));

  const hasRoberto = book.sheets.some((s) => s.employeeId === ROBERTO_ID);
  check("5b. Roberto sheet in result", hasRoberto);

  check("5c. skipStatutory = false on book", book.skipStatutory === false);

  // OC2 period is July 1-15 (FIRST_CUTOFF for SECOND_CUTOFF tenant) → no statutory
  const robertoSheet = book.sheets.find((s) => s.employeeId === ROBERTO_ID)!;
  check("5d. Roberto statutory not deducted (FIRST_CUTOFF period)", robertoSheet.statutoryDeductedSnapshot === false);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== smoke-f1: OFF_CYCLE Run Type ===\n");
  try {
    await cleanup(); // pre-clean
    await seedPeriodInput(11); // 11 days worked on July 16-31

    await test1();
    const bookId = await test2();
    await test3(bookId);
    await test4(bookId);
    await test5();

    await cleanup(); // post-clean
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(`\n${failures === 0 ? "✅" : "❌"} ${total - failures}/${total} PASS\n`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
