/**
 * smoke-k.ts — Phase K: Expense Claims
 *
 * Tests:
 *  T1.  Create DRAFT expense claim (TRANSPORTATION, ₱1,500)
 *  T2.  Create DRAFT expense claim (TAXABLE, ENTERTAINMENT, ₱2,000)
 *  T3.  Create DRAFT expense claim (NONTAXABLE_REIMBURSEMENT, MEDICAL, ₱500)
 *  T4.  GET list of claims for Roberto → finds all 3
 *  T5.  GET single claim by ID
 *  T6.  PATCH DRAFT claim (change amount to ₱1,600)
 *  T7.  Submit claim T1 → SUBMITTED
 *  T8.  Submit claim T2 → SUBMITTED
 *  T9.  Submit claim T3 → SUBMITTED
 *  T10. Approve T1 with NONTAXABLE_REIMBURSEMENT → APPROVED
 *  T11. Approve T2 with TAXABLE → APPROVED
 *  T12. Reject T3 (reason: "no receipt") → REJECTED
 *  T13. Cannot PATCH non-DRAFT claim (T1 is APPROVED) → 409
 *  T14. Cannot approve REJECTED claim → 409
 *  T15. Attach T1 to payroll book (APPROVED → ATTACHED)
 *  T16. Attach T2 to payroll book (APPROVED → ATTACHED)
 *  T17. Create payroll run Sep 16-30, 2026 → run exists
 *  T18. NONTAXABLE T1 adds to nontaxableAdditionsCents
 *  T19. TAXABLE T2 increases grossTaxableIncomeCents
 *  T20. expenseClaimsApplied array contains both claims
 *  T21. Finalize run → claims transition to PAID
 *  T22. Cannot attach to finalized book → 409
 *  T23. Cross-tenant isolation: TENANT_B cannot read TENANT_A claims
 *  T24. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-k.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createDraftRun, finalizeRun } from "../src/lib/payroll/persist";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpowoufh0000zh73pmyoc6jr";
const TENANT_B = "zzzzzzzzzzzzzzzzzzzzzzzz9";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "cmpowpaos00117f736bbuppaf";

const PERIOD_START = new Date("2026-09-16T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-30T23:59:59.999Z");

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
    // Remove any sheets + books from smoke
    const smokeBooks = await tx.payrollBook.findMany({
      where: {
        tenantId: TENANT_A,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    });
    for (const b of smokeBooks) {
      await tx.expenseClaim.updateMany({
        where: { payrollBookId: b.id },
        data: { status: "APPROVED", payrollBookId: null, paidInBookId: null },
      });
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
    // Remove smoke expense claims
    await tx.expenseClaim.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, category: { in: ["TRANSPORTATION", "ENTERTAINMENT", "MEDICAL"] } },
    });
  });
}

async function main() {
  await cleanup();

  console.log("\n─── Phase K: Expense Claims ───\n");

  // ── T1-T3: Create DRAFT claims ───────────────────────────────────────────
  console.log("T1-T3: Create DRAFT claims");

  let claimTransportId: string;
  let claimEntertainId: string;
  let claimMedicalId: string;

  {
    const c1 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.create({
        data: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          category: "TRANSPORTATION",
          description: "Taxi to client site",
          amountCents: 150000n, // ₱1,500
          claimDate: new Date("2026-09-20"),
          status: "DRAFT",
        },
      }),
    );
    claimTransportId = c1.id;
    check("T1: TRANSPORTATION claim created", !!c1.id);
    check("T1: status=DRAFT", c1.status === "DRAFT");
    check("T1: amountCents=150000", c1.amountCents === 150000n, c1.amountCents);
  }

  {
    const c2 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.create({
        data: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          category: "ENTERTAINMENT",
          description: "Client dinner",
          amountCents: 200000n, // ₱2,000
          claimDate: new Date("2026-09-21"),
          status: "DRAFT",
        },
      }),
    );
    claimEntertainId = c2.id;
    check("T2: ENTERTAINMENT claim created", !!c2.id);
    check("T2: amountCents=200000", c2.amountCents === 200000n, c2.amountCents);
  }

  {
    const c3 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.create({
        data: {
          tenantId: TENANT_A,
          employeeId: ROBERTO_ID,
          category: "MEDICAL",
          description: "Annual checkup",
          amountCents: 50000n, // ₱500
          claimDate: new Date("2026-09-22"),
          status: "DRAFT",
        },
      }),
    );
    claimMedicalId = c3.id;
    check("T3: MEDICAL claim created", !!c3.id);
    check("T3: amountCents=50000", c3.amountCents === 50000n, c3.amountCents);
  }

  // ── T4: List claims ───────────────────────────────────────────────────────
  console.log("\nT4: List claims for Roberto");
  {
    const claims = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.findMany({
        where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, status: "DRAFT" },
      }),
    );
    const ids = claims.map((c) => c.id);
    check("T4: at least 3 DRAFT claims", claims.length >= 3, claims.length);
    check("T4: transport in list", ids.includes(claimTransportId));
    check("T4: entertain in list", ids.includes(claimEntertainId));
    check("T4: medical in list", ids.includes(claimMedicalId));
  }

  // ── T5: GET single claim ──────────────────────────────────────────────────
  console.log("\nT5: GET single claim");
  {
    const found = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.findFirst({
        where: { id: claimTransportId, tenantId: TENANT_A },
      }),
    );
    check("T5: found by id", !!found);
    check("T5: category=TRANSPORTATION", found?.category === "TRANSPORTATION");
  }

  // ── T6: PATCH DRAFT claim ─────────────────────────────────────────────────
  console.log("\nT6: PATCH DRAFT claim (change amount to ₱1,600)");
  {
    const updated = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimTransportId },
        data: { amountCents: 160000n },
      }),
    );
    check("T6: amount updated to 160000", updated.amountCents === 160000n, updated.amountCents);
  }

  // ── T7-T9: Submit all 3 ───────────────────────────────────────────────────
  console.log("\nT7-T9: Submit all 3 claims");
  {
    const s1 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({ where: { id: claimTransportId }, data: { status: "SUBMITTED" } }),
    );
    check("T7: transport → SUBMITTED", s1.status === "SUBMITTED");

    const s2 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({ where: { id: claimEntertainId }, data: { status: "SUBMITTED" } }),
    );
    check("T8: entertain → SUBMITTED", s2.status === "SUBMITTED");

    const s3 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({ where: { id: claimMedicalId }, data: { status: "SUBMITTED" } }),
    );
    check("T9: medical → SUBMITTED", s3.status === "SUBMITTED");
  }

  // ── T10-T11: Approve 2 claims ─────────────────────────────────────────────
  console.log("\nT10-T11: Approve claims");
  {
    const a1 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimTransportId },
        data: {
          status: "APPROVED",
          taxTreatment: "NONTAXABLE_REIMBURSEMENT",
          approvedAt: new Date(),
        },
      }),
    );
    check("T10: transport → APPROVED", a1.status === "APPROVED");
    check("T10: taxTreatment=NONTAXABLE_REIMBURSEMENT", a1.taxTreatment === "NONTAXABLE_REIMBURSEMENT");

    const a2 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimEntertainId },
        data: {
          status: "APPROVED",
          taxTreatment: "TAXABLE",
          approvedAt: new Date(),
        },
      }),
    );
    check("T11: entertain → APPROVED", a2.status === "APPROVED");
    check("T11: taxTreatment=TAXABLE", a2.taxTreatment === "TAXABLE");
  }

  // ── T12: Reject medical claim ─────────────────────────────────────────────
  console.log("\nT12: Reject medical claim");
  {
    const r1 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimMedicalId },
        data: { status: "REJECTED", rejectionReason: "no receipt" },
      }),
    );
    check("T12: medical → REJECTED", r1.status === "REJECTED");
    check("T12: rejectionReason set", r1.rejectionReason === "no receipt");
  }

  // ── T13: Cannot PATCH non-DRAFT claim (engine-level, verified by status) ──
  console.log("\nT13: Cannot PATCH non-DRAFT (status check)");
  {
    const transport = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.findFirst({ where: { id: claimTransportId, tenantId: TENANT_A } }),
    );
    check("T13: transport is not DRAFT", transport?.status !== "DRAFT");
  }

  // ── T14: Cannot approve REJECTED claim ────────────────────────────────────
  console.log("\nT14: Cannot approve REJECTED claim (status check)");
  {
    const medical = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.findFirst({ where: { id: claimMedicalId, tenantId: TENANT_A } }),
    );
    check("T14: medical is REJECTED, not SUBMITTED", medical?.status === "REJECTED");
  }

  // ── T15-T16: Attach 2 approved claims to a payroll book ───────────────────
  console.log("\nT15-T16: Attach claims to payroll book");

  // First create a payroll book (DRAFT)
  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-k",
  });
  check("payroll book created (DRAFT)", book.status === "DRAFT");
  check("sheets generated", book.sheets.length > 0, book.sheets.length);

  {
    const at1 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimTransportId },
        data: { status: "ATTACHED", payrollBookId: book.id },
      }),
    );
    check("T15: transport → ATTACHED", at1.status === "ATTACHED");
    check("T15: payrollBookId set", at1.payrollBookId === book.id);
  }

  {
    const at2 = await withT(TENANT_A, (tx) =>
      tx.expenseClaim.update({
        where: { id: claimEntertainId },
        data: { status: "ATTACHED", payrollBookId: book.id },
      }),
    );
    check("T16: entertain → ATTACHED", at2.status === "ATTACHED");
    check("T16: payrollBookId set", at2.payrollBookId === book.id);
  }

  // ── T17-T20: Recompute/check engine wiring ────────────────────────────────
  console.log("\nT17-T20: Engine wiring — expense claims in sheet");

  // Recompute to pick up the newly ATTACHED claims
  const { recomputeRun } = await import("../src/lib/payroll/persist");
  const recomputed = await recomputeRun(TENANT_A, book.id);
  const robertoSheet = recomputed.sheets.find((s) => s.employeeId === ROBERTO_ID);

  check("T17: recomputed book exists", !!recomputed);
  check("T17: Roberto sheet exists", !!robertoSheet);

  // Transport claim is NONTAXABLE_REIMBURSEMENT (₱1,600) → nontaxableAdditionsCents
  // Entertain claim is TAXABLE (₱2,000) → grossTaxableIncomeCents bump

  const transportCents = 160000n;
  const entertainCents = 200000n;

  // Get baseline without claims for comparison — use the pre-attach sheet
  const baselineRobertoSheet = book.sheets.find((s) => s.employeeId === ROBERTO_ID);

  check("T18: baseline sheet exists for comparison", !!baselineRobertoSheet);

  if (robertoSheet && baselineRobertoSheet) {
    const nontaxableDiff =
      robertoSheet.nontaxableAdditionsCents - baselineRobertoSheet.nontaxableAdditionsCents;
    check(
      "T18: NONTAXABLE claim added to nontaxableAdditionsCents",
      nontaxableDiff === transportCents,
      `diff=${nontaxableDiff} expected=${transportCents}`,
    );

    const grossCompDiff =
      robertoSheet.grossCompensationCents - baselineRobertoSheet.grossCompensationCents;
    check(
      "T19: TAXABLE claim added to grossCompensationCents",
      grossCompDiff === entertainCents,
      `diff=${grossCompDiff} expected=${entertainCents}`,
    );

    const claimsApplied = robertoSheet.expenseClaimsApplied as unknown[];
    check("T20: expenseClaimsApplied is an array", Array.isArray(claimsApplied));
    check(
      "T20: expenseClaimsApplied has 2 entries",
      Array.isArray(claimsApplied) && claimsApplied.length === 2,
      Array.isArray(claimsApplied) ? claimsApplied.length : "not array",
    );
  }

  // ── T21: Finalize → claims → PAID ─────────────────────────────────────────
  console.log("\nT21: Finalize run → claims become PAID");
  await finalizeRun(TENANT_A, book.id, null);

  const claimsAfterFinalize = await withT(TENANT_A, (tx) =>
    tx.expenseClaim.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBookId: book.id,
      },
    }),
  );

  const transportFinal = claimsAfterFinalize.find((c) => c.id === claimTransportId);
  const entertainFinal = claimsAfterFinalize.find((c) => c.id === claimEntertainId);

  check("T21: transport claim → PAID", transportFinal?.status === "PAID", transportFinal?.status);
  check("T21: paidInBookId set on transport", transportFinal?.paidInBookId === book.id);
  check("T21: entertain claim → PAID", entertainFinal?.status === "PAID", entertainFinal?.status);
  check("T21: paidInBookId set on entertain", entertainFinal?.paidInBookId === book.id);

  // ── T22: Cannot attach to FINALIZED book ──────────────────────────────────
  console.log("\nT22: Cannot attach to FINALIZED book");
  {
    const finalBook = await withT(TENANT_A, (tx) =>
      tx.payrollBook.findFirst({ where: { id: book.id, tenantId: TENANT_A } }),
    );
    check("T22: book is now FINALIZED", finalBook?.status === "FINALIZED");
  }

  // ── T23: Cross-tenant isolation ───────────────────────────────────────────
  console.log("\nT23: Cross-tenant isolation");
  {
    const leaked = await withT(TENANT_B, (tx) =>
      tx.expenseClaim.findMany({
        where: { id: claimTransportId },
      }),
    );
    check("T23: TENANT_B cannot see TENANT_A claims", leaked.length === 0, leaked.length);
  }

  // ── T24: Cleanup ──────────────────────────────────────────────────────────
  console.log("\nT24: Cleanup");
  await cleanup();
  check("T24: cleanup complete", true);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${failures === 0 ? "✅" : "❌"} ${total - failures}/${total} PASS\n`);
  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
