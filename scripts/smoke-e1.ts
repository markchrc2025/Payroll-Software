/**
 * smoke-e1.ts — verifies Phase E1: 13th Month Pay Engine.
 *
 * Exercises (all via payroll_app role, RLS enforced):
 *   1. Create + finalize a REGULAR run for 2026-07-01..07-15 (Roberto 11 days).
 *   2. Create a YEAR_END run for 2026-01-01..12-31.
 *      → 10 sheets; Roberto's thirteenthMonthCents = sum(basePay) / 12.
 *      → grossCompensation = thirteenth; nontaxable13Month = thirteenth (< cap).
 *      → grossTaxableIncome = 0; WHT = 0; SSS/PhilHealth/PagIBIG EE = 0.
 *   3. Recompute YEAR_END (DRAFT) → same values.
 *   4. Employee with no prior REGULAR sheets → 0 grossCompensation.
 *   5. Finalize YEAR_END → FINALIZED.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-e1.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
  recomputeRun,
} from "../src/lib/payroll/persist";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu"; // ₱55k NCR MONTHLY salary

// E1 smoke uses a different period to avoid conflicts with D3/D4 (June period).
const REG_START  = new Date("2026-07-01T00:00:00.000Z");
const REG_END    = new Date("2026-07-15T00:00:00.000Z");
const YE_START   = new Date("2026-01-01T00:00:00.000Z");
const YE_END     = new Date("2026-12-31T00:00:00.000Z");

let failures = 0;
let total = 0;
function ok(label: string, cond: boolean, detail?: string) {
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

async function cleanup() {
  await withT(TENANT_A, async (tx) => {
    // Remove E1 REGULAR book.
    const regBooks = await tx.payrollBook.findMany({
      where: { tenantId: TENANT_A, periodStart: REG_START, periodEnd: REG_END },
    });
    for (const b of regBooks) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }

    // Remove any YEAR_END book for calendar year 2026.
    const yeBooks = await tx.payrollBook.findMany({
      where: {
        tenantId: TENANT_A,
        runType: "YEAR_END",
        periodStart: { gte: YE_START, lte: YE_END },
      },
    });
    for (const b of yeBooks) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }

    // Remove PeriodInput for Roberto at the E1 REGULAR period (if any).
    await tx.periodInput.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: REG_START,
        periodEnd: REG_END,
      },
    });
  });
}

async function main() {
  console.log("\n--- E1 smoke: 13th Month Pay Engine ---\n");

  await cleanup();

  // ── 1. Create PeriodInput for Roberto (11 working days in July 1–15) ──────
  console.log("1. Seed Roberto PeriodInput (11 days, July 1–15)");
  await withT(TENANT_A, (tx) =>
    tx.periodInput.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: REG_START,
        periodEnd: REG_END,
        daysWorked: "11",
      },
    }),
  );

  // ── 2. Create + finalize REGULAR run ──────────────────────────────────────
  console.log("\n2. Create REGULAR run 2026-07-01..07-15 SEMI_MONTHLY");
  const regBook = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: REG_START,
    periodEnd: REG_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-e1-regular",
    createdByUserId: null,
  });
  ok("REGULAR book created (DRAFT)", regBook.status === "DRAFT");
  ok(
    "REGULAR book has 10 sheets",
    regBook.sheets.length === 10,
    `got ${regBook.sheets.length}`,
  );

  const regRobertoSheet = regBook.sheets.find(
    (s) => s.employeeId === ROBERTO_ID,
  );
  ok("Roberto REGULAR sheet exists", Boolean(regRobertoSheet));
  const robBasePay = regRobertoSheet?.basePayCents ?? 0n;
  ok(
    "Roberto REGULAR basePay > 0 (PeriodInput applied)",
    robBasePay > 0n,
    `₱${(Number(robBasePay) / 100).toFixed(2)}`,
  );

  console.log("\n3. Finalize REGULAR run");
  const regFinal = await finalizeRun(TENANT_A, regBook.id, null);
  ok("REGULAR run FINALIZED", regFinal.status === "FINALIZED");

  // ── 3. Create YEAR_END run ────────────────────────────────────────────────
  console.log("\n4. Create YEAR_END run 2026-01-01..12-31");
  const yeBook = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: YE_START,
    periodEnd: YE_END,
    cycle: "SEMI_MONTHLY", // cycle irrelevant for YEAR_END computation
    runType: "YEAR_END",
    notes: "smoke-e1-year-end",
    createdByUserId: null,
  });
  ok("YEAR_END book created (DRAFT)", yeBook.status === "DRAFT");
  ok(
    "YEAR_END book has 10 sheets",
    yeBook.sheets.length === 10,
    `got ${yeBook.sheets.length}`,
  );

  // ── 4. Roberto YEAR_END assertions ───────────────────────────────────────
  console.log("\n5. Roberto YEAR_END sheet assertions");
  const yeRoberto = yeBook.sheets.find((s) => s.employeeId === ROBERTO_ID);
  ok("Roberto YEAR_END sheet exists", Boolean(yeRoberto));

  if (yeRoberto) {
    // Expected thirteenth = Σ(basePay from REGULAR FINALIZED sheets in 2026) / 12.
    // Only one sheet in our test: robBasePay / 12.
    const expectedThirteenth = robBasePay / 12n;

    ok(
      "grossCompensationCents = thirteenthMonth",
      yeRoberto.grossCompensationCents === expectedThirteenth,
      `expected ${expectedThirteenth}, got ${yeRoberto.grossCompensationCents}`,
    );

    // Non-taxable = all of it (well below ₱90,000 cap).
    ok(
      "nontaxable13MonthAndBenefitsCents = thirteenthMonth (below cap)",
      yeRoberto.nontaxable13MonthAndBenefitsCents === expectedThirteenth,
      `expected ${expectedThirteenth}, got ${yeRoberto.nontaxable13MonthAndBenefitsCents}`,
    );

    // No taxable excess → WHT = 0.
    ok(
      "grossTaxableIncomeCents = 0",
      yeRoberto.grossTaxableIncomeCents === 0n,
      `got ${yeRoberto.grossTaxableIncomeCents}`,
    );
    ok(
      "withholdingTaxCents = 0",
      yeRoberto.withholdingTaxCents === 0n,
      `got ${yeRoberto.withholdingTaxCents}`,
    );

    // No statutory contributions on 13th month pay.
    ok("sssEeCents = 0", yeRoberto.sssEeCents === 0n);
    ok("philhealthEeCents = 0", yeRoberto.philhealthEeCents === 0n);
    ok("pagibigEeCents = 0", yeRoberto.pagibigEeCents === 0n);
    ok("sssErCents = 0", yeRoberto.sssErCents === 0n);

    // Net = thirteenth - loanDeductions (no statutory deductions).
    const expectedNet =
      expectedThirteenth - yeRoberto.loanDeductionsCents;
    ok(
      "netPayCents = thirteenth - loanDeductions",
      yeRoberto.netPayCents === expectedNet,
      `expected ${expectedNet}, got ${yeRoberto.netPayCents}`,
    );

    // basePay of the year-end sheet should be 0 (regular pay is not computed).
    ok(
      "basePayCents = 0 (year-end uses thirteenth, not daily-rate pay)",
      yeRoberto.basePayCents === 0n,
    );

    // statutoryDeductedSnapshot should be false.
    ok(
      "statutoryDeductedSnapshot = false",
      yeRoberto.statutoryDeductedSnapshot === false,
    );
  }

  // ── 5. Employee with no prior REGULAR sheets → 0 gross ───────────────────
  console.log(
    "\n6. Employee without prior REGULAR sheets → thirteenth = 0",
  );
  // Find the first non-Roberto sheet in the YEAR_END book.
  const otherYeSheet = yeBook.sheets.find(
    (s) => s.employeeId !== ROBERTO_ID,
  );
  ok("Other employee YEAR_END sheet exists", Boolean(otherYeSheet));
  if (otherYeSheet) {
    // We only created a PeriodInput for Roberto in the REGULAR run, so other
    // employees have basePay = 0 → their thirteenth = 0 / 12 = 0.
    // (Unless another smoke left a REGULAR book with non-zero basePay for them,
    //  but cleanup removes any E1-period books at start.)
    ok(
      "Other employee grossCompensation = 0 (no prior base pay)",
      otherYeSheet.grossCompensationCents === 0n,
      `got ${otherYeSheet.grossCompensationCents}`,
    );
    ok(
      "Other employee nontaxable13Month = 0",
      otherYeSheet.nontaxable13MonthAndBenefitsCents === 0n,
    );
  }

  // ── 6. Recompute YEAR_END (DRAFT) ─────────────────────────────────────────
  console.log("\n7. Recompute YEAR_END run (DRAFT)");
  const yeRecomputed = await recomputeRun(TENANT_A, yeBook.id);
  ok(
    "Recomputed YEAR_END still DRAFT",
    yeRecomputed.status === "DRAFT",
  );
  ok(
    "Recomputed has 10 sheets",
    yeRecomputed.sheets.length === 10,
    `got ${yeRecomputed.sheets.length}`,
  );
  const reRoberto = yeRecomputed.sheets.find(
    (s) => s.employeeId === ROBERTO_ID,
  );
  ok(
    "Recomputed Roberto grossComp unchanged",
    reRoberto?.grossCompensationCents === (robBasePay / 12n),
    `got ${reRoberto?.grossCompensationCents}`,
  );

  // ── 7. Finalize YEAR_END ──────────────────────────────────────────────────
  console.log("\n8. Finalize YEAR_END run");
  const yeFinal = await finalizeRun(TENANT_A, yeBook.id, null);
  ok("YEAR_END run FINALIZED", yeFinal.status === "FINALIZED");

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n--- E1 smoke: ${total - failures}/${total} passed ---\n`);
  if (failures > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
