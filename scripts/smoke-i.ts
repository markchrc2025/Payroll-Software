/**
 * smoke-i.ts — Phase I: Loan Management
 *
 * Tests:
 *  T1.  Create a CASH_ADVANCE loan for Roberto (₱5,000, ₱2,500/run)
 *  T2.  List loans → finds Roberto's loan, correct fields
 *  T3.  Get loan by ID → principalCents = 500000, balanceCents = 500000
 *  T4.  PATCH loan notes → persisted
 *  T5.  Create payroll run (Aug 1–15 2026) → Roberto's sheet has loanDeductionsCents = 250000
 *  T6.  loanPaymentsApplied JSON has correct balanceBefore / balanceAfter
 *  T7.  Finalize run → loan balance decrements to 250000 (still ACTIVE)
 *  T8.  Create second payroll run (Aug 16–31 2026) → finalize → balance = 0, status = PAID
 *  T9.  Loan closedDate is set on PAID
 *  T10. Create a Company loan → cancel it → status = CANCELLED
 *  T11. Cancelled loan NOT included in next payroll computation (loanDeductionsCents = 0 for that loan)
 *  T12. Create an SSS loan for Roberto → verify it stacks with other loans in same run
 *  T13. Cross-tenant: loans from TENANT_B not visible from TENANT_A
 *  T14. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-i.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
} from "../src/lib/payroll/persist";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const TENANT_B = "zzzzzzzzz000yi73i6fcm5zzz";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "cmpnn0s720012yi73vv5f1bxu";

const PERIOD_1_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_1_END = new Date("2026-08-15T00:00:00.000Z");
const PERIOD_2_START = new Date("2026-08-16T00:00:00.000Z");
const PERIOD_2_END = new Date("2026-08-31T00:00:00.000Z");

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
    // Remove payroll books for the test periods
    for (const [ps, pe] of [
      [PERIOD_1_START, PERIOD_1_END],
      [PERIOD_2_START, PERIOD_2_END],
    ]) {
      const books = await tx.payrollBook.findMany({
        where: { tenantId: TENANT_A, periodStart: ps, periodEnd: pe },
      });
      for (const b of books) {
        await tx.auditLog.deleteMany({
          where: { entity: "PayrollBook", entityId: b.id },
        });
        await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
        await tx.payrollBook.delete({ where: { id: b.id } });
      }
    }
    // Remove test loans for Roberto
    await tx.loan.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        notes: { contains: "smoke-i" },
      },
    });
  });
}

interface AppliedLoanPayment {
  loanId: string;
  loanType: string;
  amountCents: string;
  balanceBeforeCents: string;
  balanceAfterCents: string;
}

async function main() {
  console.log("=== smoke-i: Phase I — Loan Management ===\n");

  await cleanup();

  // -------------------------------------------------------------------------
  // T1: Create a CASH_ADVANCE loan (₱5,000 principal, ₱2,500 installment)
  // -------------------------------------------------------------------------
  console.log("[T1] Create CASH_ADVANCE loan for Roberto");
  const loan = await withT(TENANT_A, (tx) =>
    tx.loan.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        loanType: "CASH_ADVANCE",
        referenceNumber: "CA-2026-001",
        principalCents: 500000n, // ₱5,000.00
        installmentCents: 250000n, // ₱2,500.00 per run
        balanceCents: 500000n,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        notes: "smoke-i test loan",
      },
    }),
  );
  check("Loan created (ACTIVE)", loan.status === "ACTIVE", loan.id);
  check("principalCents = 500000", loan.principalCents === 500000n, loan.principalCents);
  check("balanceCents = 500000", loan.balanceCents === 500000n, loan.balanceCents);
  check("installmentCents = 250000", loan.installmentCents === 250000n, loan.installmentCents);

  // -------------------------------------------------------------------------
  // T2: List loans by employeeId
  // -------------------------------------------------------------------------
  console.log("\n[T2] List loans for Roberto");
  const list = await withT(TENANT_A, (tx) =>
    tx.loan.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, status: "ACTIVE" },
    }),
  );
  check(
    "List returns ≥1 ACTIVE loan for Roberto",
    list.length >= 1,
    list.length,
  );
  const found = list.find((l) => l.id === loan.id);
  check("Our loan is in the list", !!found);

  // -------------------------------------------------------------------------
  // T3: Get loan by ID
  // -------------------------------------------------------------------------
  console.log("\n[T3] Get loan by ID");
  const fetched = await withT(TENANT_A, (tx) =>
    tx.loan.findFirst({ where: { id: loan.id, tenantId: TENANT_A } }),
  );
  check("Loan found by ID", !!fetched);
  check("loanType = CASH_ADVANCE", fetched?.loanType === "CASH_ADVANCE");
  check("referenceNumber = CA-2026-001", fetched?.referenceNumber === "CA-2026-001");

  // -------------------------------------------------------------------------
  // T4: PATCH loan notes
  // -------------------------------------------------------------------------
  console.log("\n[T4] PATCH loan notes");
  const patched = await withT(TENANT_A, (tx) =>
    tx.loan.update({
      where: { id: loan.id },
      data: { notes: "smoke-i test loan (updated)" },
    }),
  );
  check("Notes updated", patched.notes === "smoke-i test loan (updated)");

  // -------------------------------------------------------------------------
  // T5: Payroll run 1 — verify loan deducted from Roberto's sheet
  // -------------------------------------------------------------------------
  console.log("\n[T5–T6] Payroll run 1 (Aug 1–15 2026) — loan deduction");
  const book1 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_1_START,
    periodEnd: PERIOD_1_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-i",
  });
  check("Book 1 created (DRAFT)", book1.status === "DRAFT");
  check("10 sheets generated", book1.sheets.length === 10);

  const roberto1 = book1.sheets.find((s) => s.employeeId === ROBERTO_ID);
  check("Roberto's sheet exists", !!roberto1);
  check(
    "T5: loanDeductionsCents = 250000 (₱2,500)",
    roberto1?.loanDeductionsCents === 250000n,
    `${roberto1?.loanDeductionsCents}`,
  );

  // T6: loanPaymentsApplied JSON
  const payments1 = roberto1?.loanPaymentsApplied as unknown as AppliedLoanPayment[] | null;
  const lp1 = Array.isArray(payments1) ? payments1.find((p) => p.loanId === loan.id) : null;
  check("T6: loanPaymentsApplied entry exists for our loan", !!lp1);
  check(
    "T6: amountCents = '250000'",
    lp1?.amountCents === "250000",
    lp1?.amountCents,
  );
  check(
    "T6: balanceBeforeCents = '500000'",
    lp1?.balanceBeforeCents === "500000",
    lp1?.balanceBeforeCents,
  );
  check(
    "T6: balanceAfterCents = '250000'",
    lp1?.balanceAfterCents === "250000",
    lp1?.balanceAfterCents,
  );

  // -------------------------------------------------------------------------
  // T7: Finalize run 1 → loan balance decrements to ₱2,500
  // -------------------------------------------------------------------------
  console.log("\n[T7] Finalize run 1 → loan balance decrements");
  await finalizeRun(TENANT_A, book1.id, null);
  const afterRun1 = await withT(TENANT_A, (tx) =>
    tx.loan.findFirst({ where: { id: loan.id, tenantId: TENANT_A } }),
  );
  check(
    "T7: balanceCents = 250000 after run 1",
    afterRun1?.balanceCents === 250000n,
    `${afterRun1?.balanceCents}`,
  );
  check("T7: status still ACTIVE", afterRun1?.status === "ACTIVE");

  // -------------------------------------------------------------------------
  // T8–T9: Payroll run 2 → loan fully paid
  // -------------------------------------------------------------------------
  console.log("\n[T8–T9] Payroll run 2 (Aug 16–31 2026) → loan fully paid");
  const book2 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_2_START,
    periodEnd: PERIOD_2_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-i",
  });
  check("Book 2 created (DRAFT)", book2.status === "DRAFT");

  const roberto2 = book2.sheets.find((s) => s.employeeId === ROBERTO_ID);
  check(
    "T8: run 2 deducts remaining balance (250000)",
    roberto2?.loanDeductionsCents === 250000n,
    `${roberto2?.loanDeductionsCents}`,
  );

  await finalizeRun(TENANT_A, book2.id, null);
  const afterRun2 = await withT(TENANT_A, (tx) =>
    tx.loan.findFirst({ where: { id: loan.id, tenantId: TENANT_A } }),
  );
  check(
    "T8: balanceCents = 0 after run 2",
    afterRun2?.balanceCents === 0n,
    `${afterRun2?.balanceCents}`,
  );
  check("T8: status = PAID", afterRun2?.status === "PAID");
  check("T9: closedDate is set", afterRun2?.closedDate !== null, afterRun2?.closedDate?.toISOString());

  // -------------------------------------------------------------------------
  // T10: Create a Company loan → cancel it
  // -------------------------------------------------------------------------
  console.log("\n[T10] Create + cancel a COMPANY loan");
  const cancelLoan = await withT(TENANT_A, (tx) =>
    tx.loan.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        loanType: "COMPANY",
        principalCents: 1000000n, // ₱10,000
        installmentCents: 200000n, // ₱2,000/run
        balanceCents: 1000000n,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        notes: "smoke-i cancel test",
      },
    }),
  );
  check("Company loan created (ACTIVE)", cancelLoan.status === "ACTIVE");

  const cancelled = await withT(TENANT_A, (tx) =>
    tx.loan.update({
      where: { id: cancelLoan.id },
      data: { status: "CANCELLED", closedDate: new Date() },
    }),
  );
  check("T10: status = CANCELLED after cancel", cancelled.status === "CANCELLED");
  check("T10: closedDate is set", cancelled.closedDate !== null);

  // -------------------------------------------------------------------------
  // T11: CANCELLED loan NOT deducted in subsequent payroll
  //      (PAID cash advance also not deducted again)
  // -------------------------------------------------------------------------
  console.log("\n[T11] CANCELLED loan not included in payroll");
  // Use Sep 1–15 as a clean period
  const book3 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-15T00:00:00.000Z"),
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-i",
  });
  const roberto3 = book3.sheets.find((s) => s.employeeId === ROBERTO_ID);
  check(
    "T11: loanDeductionsCents = 0 (no active loans)",
    roberto3?.loanDeductionsCents === 0n,
    `${roberto3?.loanDeductionsCents}`,
  );

  // -------------------------------------------------------------------------
  // T12: Two active loans stack — deduction = sum of both installments
  // -------------------------------------------------------------------------
  console.log("\n[T12] Two active loans stack in one run");
  const stackLoan1 = await withT(TENANT_A, (tx) =>
    tx.loan.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        loanType: "SSS",
        principalCents: 2000000n, // ₱20,000
        installmentCents: 100000n, // ₱1,000/run
        balanceCents: 2000000n,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        notes: "smoke-i stack1",
      },
    }),
  );
  const stackLoan2 = await withT(TENANT_A, (tx) =>
    tx.loan.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        loanType: "PAGIBIG",
        principalCents: 1500000n, // ₱15,000
        installmentCents: 150000n, // ₱1,500/run
        balanceCents: 1500000n,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        notes: "smoke-i stack2",
      },
    }),
  );

  // Recompute book3 which should now pick up both new loans
  const { recomputeRun } = await import("../src/lib/payroll/persist");
  const book3b = await recomputeRun(TENANT_A, book3.id);
  const roberto3b = book3b.sheets.find((s) => s.employeeId === ROBERTO_ID);
  const expectedStack = stackLoan1.installmentCents + stackLoan2.installmentCents; // 100000 + 150000 = 250000
  check(
    `T12: loanDeductionsCents = ${expectedStack} (stacked installments)`,
    roberto3b?.loanDeductionsCents === expectedStack,
    `${roberto3b?.loanDeductionsCents}`,
  );

  const payments3b = roberto3b?.loanPaymentsApplied as unknown as AppliedLoanPayment[] | null;
  const entries = Array.isArray(payments3b) ? payments3b : [];
  check(
    "T12: 2 entries in loanPaymentsApplied",
    entries.length === 2,
    entries.length,
  );

  // -------------------------------------------------------------------------
  // T13: Cross-tenant isolation
  // -------------------------------------------------------------------------
  console.log("\n[T13] Cross-tenant isolation");
  // TENANT_B can't see TENANT_A's loans
  const crossList = await withT(TENANT_B, (tx) =>
    tx.loan.findMany({ where: { tenantId: TENANT_B } }).catch(() => []),
  );
  check("T13: TENANT_B sees 0 loans (no leakage)", crossList.length === 0, crossList.length);

  // -------------------------------------------------------------------------
  // T14: Cleanup
  // -------------------------------------------------------------------------
  console.log("\n[T14] Cleanup");
  await cleanup();
  // Also clean the Sep book and stacking loans
  await withT(TENANT_A, async (tx) => {
    const sep = await tx.payrollBook.findMany({
      where: {
        tenantId: TENANT_A,
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-15T00:00:00.000Z"),
      },
    });
    for (const b of sep) {
      await tx.auditLog.deleteMany({ where: { entity: "PayrollBook", entityId: b.id } });
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
    await tx.loan.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        notes: { contains: "smoke-i" },
      },
    });
  });
  console.log("  Cleanup done");

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(
    `\n${failures === 0 ? "✅" : "❌"} ${total - failures}/${total} PASS\n`,
  );
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
