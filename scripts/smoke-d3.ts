/**
 * smoke-d3.ts — verifies Phase D3 gross-to-net engine + PayrollBook/Sheet.
 *
 * Exercises (all via the payroll_app role, RLS enforced):
 *   1. POST run for 2026-06-16..06-30 SEMI_MONTHLY REGULAR (second cutoff)
 *      → 10 sheets created; spot-check Roberto Aquino's numbers.
 *   2. Duplicate POST → 409.
 *   3. Recompute (DRAFT) → succeeds.
 *   4. Finalize → DRAFT→FINALIZED; loan balance decremented; AuditLog written.
 *   5. Recompute on FINALIZED → 409.
 *   6. Re-finalize idempotent → no extra loan decrement.
 *   7. Cross-tenant cannot see book/sheets.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-d3.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
  PayrollRunConflictError,
  recomputeRun,
} from "../src/lib/payroll/persist";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu"; // Roberto Aquino (₱55k NCR REGULAR)
const TENANT_B = "zzzzzzzzzzzzzzzzzzzzzzzz";

const PERIOD_START = new Date("2026-06-16T00:00:00.000Z");
const PERIOD_END = new Date("2026-06-30T00:00:00.000Z");

let failures = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
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

async function cleanup() {
  // Remove any prior smoke books for this period.
  await withT(TENANT_A, async (tx) => {
    const books = await tx.payrollBook.findMany({
      where: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    });
    for (const b of books) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
    // Remove smoke audit log entries (cleanup between runs).
    for (const b of books) {
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
    }
    // Remove smoke loans + recreate a fresh one so balance state is reset.
    await tx.loan.deleteMany({
      where: {
        employeeId: ROBERTO_ID,
        referenceNumber: "SMOKE-D3-LOAN",
      },
    });
    await tx.loan.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        loanType: "COMPANY",
        referenceNumber: "SMOKE-D3-LOAN",
        principalCents: 1_000_000_00n,
        installmentCents: 2_500_00n, // ₱2,500 per period
        balanceCents: 1_000_000_00n,
        status: "ACTIVE",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  });
}

async function main() {
  console.log("\n--- D3 smoke ---\n");

  await cleanup();

  // 1. Create draft run.
  console.log("1. POST run 2026-06-16..06-30 SEMI_MONTHLY REGULAR");
  const book1 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-d3",
    createdByUserId: null,
  });
  ok("book created", book1.status === "DRAFT");
  ok("book has 10 sheets", book1.sheets.length === 10, `got ${book1.sheets.length}`);

  // Spot check Roberto (₱55k/month NCR REGULAR, no PeriodInput → 0 daysWorked).
  // Since no PeriodInput exists, base = 0; the engine still runs statutory.
  // For a proper spot-check we INSERT a PeriodInput with 11 days worked.
  console.log("\n2. Spot-check with PeriodInput (11 days worked)");
  await cleanup();
  await withT(TENANT_A, (tx) =>
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
        daysWorked: "11",
      },
      update: { daysWorked: "11" },
    }),
  );

  // Snapshot Roberto's loan balance AFTER the cleanup that created it.
  const before = await withT(TENANT_A, (tx) =>
    tx.loan.findFirst({
      where: { employeeId: ROBERTO_ID, referenceNumber: "SMOKE-D3-LOAN" },
    }),
  );
  if (!before) throw new Error("Expected SMOKE-D3-LOAN to exist after cleanup");

  const book2 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-d3-spot",
    createdByUserId: null,
  });
  const robSheet = book2.sheets.find((s) => s.employeeId === ROBERTO_ID);
  ok("Roberto sheet exists", Boolean(robSheet));
  if (robSheet) {
    // basePay = 55000 × 12 / 261 × 11 = 27816.0919... → BigInt integer math:
    // dailyRate = 55000_00 × 12 / 261 = 6_600_000_00 / 261 = 25287¢ (truncated)
    //   = ₱252.87 (wrong!) … actually 6,600,000_00 / 261 = 25287356¢ ish; let me check.
    //
    // BigInt truncates: 5_500_000n * 12n = 66_000_000n.  66_000_000 / 261 = 252873¢.
    //   So daily = ₱2,528.73. × 11 = ₱27,816.03. Close to 27,816.09 spec.
    const basePay = Number(robSheet.basePayCents) / 100;
    ok(
      "Roberto basePay ≈ 27,816 (±5)",
      Math.abs(basePay - 27816) < 5,
      `got ₱${basePay.toFixed(2)}`,
    );

    // SECOND_CUTOFF on 06-16..06-30 → statutory deducted.
    ok("statutoryDeductedSnapshot=true", robSheet.statutoryDeductedSnapshot);
    // PhilHealth EE @ ₱55k: rate 5% × 55000 = 2750 premium; EE = ₱1,375.
    const phicEe = Number(robSheet.philhealthEeCents) / 100;
    ok("PhilHealth EE = 1,375", phicEe === 1375, `got ₱${phicEe}`);
    // SSS EE @ ₱55k → MSC 35k → regular 5% × 20k = 1000 + MPF 5% × 15k = 750 → 1,750.
    const sssEe = Number(robSheet.sssEeCents) / 100;
    ok("SSS EE = 1,750", sssEe === 1750, `got ₱${sssEe}`);
    // Pag-IBIG EE @ ₱55k → MFS capped 10k → 2% = ₱200.
    const pgEe = Number(robSheet.pagibigEeCents) / 100;
    ok("Pag-IBIG EE = 200", pgEe === 200, `got ₱${pgEe}`);
    // Loan deduction present (Roberto's seed loan).
    const loanDed = Number(robSheet.loanDeductionsCents) / 100;
    ok("loan deduction > 0", loanDed > 0, `got ₱${loanDed}`);
    // Withholding tax via SEMI_MONTHLY BIR table (just verify > 0).
    const wt = Number(robSheet.withholdingTaxCents) / 100;
    ok("withholding > 0", wt > 0, `got ₱${wt}`);
    // Net pay > 0 sanity.
    ok("netPay > 0", robSheet.netPayCents > 0n);
  }

  // 3. Duplicate POST → 409.
  console.log("\n3. Duplicate POST → 409");
  let conflict = false;
  try {
    await createDraftRun({
      tenantId: TENANT_A,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      cycle: "SEMI_MONTHLY",
      runType: "REGULAR",
      createdByUserId: null,
    });
  } catch (e) {
    conflict = e instanceof PayrollRunConflictError;
  }
  ok("duplicate raises PayrollRunConflictError", conflict);

  // 4. Recompute (DRAFT) → succeeds.
  console.log("\n4. Recompute (DRAFT)");
  const book3 = await recomputeRun(TENANT_A, book2.id);
  ok("recompute returns 10 sheets", book3.sheets.length === 10);

  // 5. Finalize → DRAFT→FINALIZED; loan balance decremented.
  console.log("\n5. Finalize");
  const beforeBal = before.balanceCents;
  const installment = before.installmentCents;
  const finalized = await finalizeRun(TENANT_A, book2.id, null);
  ok("status = FINALIZED", finalized.status === "FINALIZED");
  ok("finalizedAt set", Boolean(finalized.finalizedAt));

  const afterLoan = await withT(TENANT_A, (tx) =>
    tx.loan.findUnique({ where: { id: before.id } }),
  );
  const expectedAfter = beforeBal > installment ? beforeBal - installment : 0n;
  ok(
    `loan balance decremented by installment (${installment})`,
    afterLoan?.balanceCents === expectedAfter,
    `before=${beforeBal} after=${afterLoan?.balanceCents}`,
  );

  // 6. Recompute on FINALIZED → 409.
  console.log("\n6. Recompute on FINALIZED → 409");
  let recompConflict = false;
  try {
    await recomputeRun(TENANT_A, book2.id);
  } catch (e) {
    recompConflict = e instanceof PayrollRunConflictError;
  }
  ok("recompute on FINALIZED raises 409", recompConflict);

  // 7. Re-finalize idempotent.
  console.log("\n7. Re-finalize idempotent");
  await finalizeRun(TENANT_A, book2.id, null);
  const afterReFin = await withT(TENANT_A, (tx) =>
    tx.loan.findUnique({ where: { id: before.id } }),
  );
  ok(
    "loan balance unchanged on re-finalize",
    afterReFin?.balanceCents === expectedAfter,
    `still ${afterReFin?.balanceCents}`,
  );

  // 8. AuditLog entry exists.
  const audits = await withT(TENANT_A, (tx) =>
    tx.auditLog.findMany({
      where: { entity: "PayrollBook", entityId: book2.id, action: "APPROVE" },
    }),
  );
  ok("AuditLog APPROVE for PayrollBook", audits.length >= 1, `count=${audits.length}`);

  // 9. Cross-tenant isolation.
  console.log("\n9. Cross-tenant isolation");
  const otherView = await withT(TENANT_B, (tx) =>
    tx.payrollBook
      .findUnique({ where: { id: book2.id } })
      .catch(() => null),
  );
  ok("TENANT_B cannot read TENANT_A book", otherView === null);

  // Cleanup.
  await cleanup();

  if (failures > 0) {
    console.log(`\n${failures} failure(s)\n`);
    process.exit(1);
  }
  console.log("\nAll D3 smoke assertions passed.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
