/**
 * smoke-e2.ts — verifies Phase E2: BIR 1601-C Monthly Withholding Tax Data.
 *
 * Exercises:
 *   1. Create + finalize a REGULAR run for 2026-06-16..06-30 (Roberto 11 days).
 *   2. Simulate the route's DB query + call buildBir1601cReport.
 *   3. Verify aggregate totals = sum of entries (internal consistency).
 *   4. Verify Roberto's entry has non-zero gross compensation and WHT.
 *   5. Verify payeeCount = 10 (all employees appear in entries).
 *   6. Verify entries are sorted by lastName.
 *   7. Request for a month with no FINALIZED data → empty report.
 *   8. Cleanup.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-e2.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
} from "../src/lib/payroll/persist";
import {
  buildBir1601cReport,
  type Bir1601cEmployeeInput,
  type Bir1601cSheetInput,
} from "../src/lib/payroll/reports/bir-1601c";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu";

const PERIOD_START = new Date("2026-06-16T00:00:00.000Z");
const PERIOD_END   = new Date("2026-06-30T00:00:00.000Z");

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
    const books = await tx.payrollBook.findMany({
      where: { tenantId: TENANT_A, periodStart: PERIOD_START, periodEnd: PERIOD_END },
    });
    for (const b of books) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
    await tx.loan.deleteMany({
      where: { employeeId: ROBERTO_ID, referenceNumber: "SMOKE-E2-LOAN" },
    });
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

/**
 * Simulate the route's query: load FINALIZED sheets for the given year/month
 * and build a Bir1601cReport.  This tests the same code path as the API
 * without requiring a running Next.js server.
 */
async function queryAndBuildReport(year: number, month: number) {
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBook: {
          status: "FINALIZED",
          periodEnd: { gte: rangeStart, lte: rangeEnd },
        },
      },
      select: {
        employeeId: true,
        grossCompensationCents: true,
        mweExemptCompensationCents: true,
        nontaxableBasicCents: true,
        nontaxableCompensationCents: true,
        nontaxable13MonthAndBenefitsCents: true,
        grossTaxableIncomeCents: true,
        withholdingTaxCents: true,
      },
    });

    const byEmployee = new Map<string, Bir1601cSheetInput[]>();
    for (const s of sheets) {
      const bucket = byEmployee.get(s.employeeId) ?? [];
      bucket.push({
        grossCompensationCents: s.grossCompensationCents,
        mweExemptCompensationCents: s.mweExemptCompensationCents,
        nontaxableBasicCents: s.nontaxableBasicCents,
        nontaxableCompensationCents: s.nontaxableCompensationCents,
        nontaxable13MonthAndBenefitsCents: s.nontaxable13MonthAndBenefitsCents,
        grossTaxableIncomeCents: s.grossTaxableIncomeCents,
        withholdingTaxCents: s.withholdingTaxCents,
      });
      byEmployee.set(s.employeeId, bucket);
    }

    const employeeIds = [...byEmployee.keys()];

    if (employeeIds.length === 0) {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: TENANT_A },
        select: { name: true },
      });
      return buildBir1601cReport({
        year,
        month,
        tenantId: TENANT_A,
        tenantName: tenant.name,
        employees: [],
      });
    }

    const [employees, tenant] = await Promise.all([
      tx.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          suffix: true,
          taxClassification: true,
        },
      }),
      tx.tenant.findUniqueOrThrow({
        where: { id: TENANT_A },
        select: { name: true },
      }),
    ]);

    const employeeInputs: Bir1601cEmployeeInput[] = employees.map((e) => ({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      suffix: e.suffix,
      taxClassification: e.taxClassification,
      sheets: byEmployee.get(e.id) ?? [],
    }));

    return buildBir1601cReport({
      year,
      month,
      tenantId: TENANT_A,
      tenantName: tenant.name,
      employees: employeeInputs,
    });
  });
}

async function main() {
  console.log("\n--- E2 smoke: BIR 1601-C Monthly Withholding Tax Data ---\n");

  await cleanup();

  // ── 1. Create PeriodInput + REGULAR run ────────────────────────────────────
  console.log("1. Seed Roberto PeriodInput (11 days) + create REGULAR run");
  await withT(TENANT_A, (tx) =>
    tx.periodInput.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        daysWorked: "11",
      },
    }),
  );

  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-e2-regular",
    createdByUserId: null,
  });
  await finalizeRun(TENANT_A, book.id, null);
  ok("REGULAR run finalized", true);

  // ── 2. Build 1601-C report for June 2026 ──────────────────────────────────
  console.log("\n2. Build 1601-C report for 2026-06");
  const report = await queryAndBuildReport(2026, 6);

  ok("report year = 2026", report.year === 2026);
  ok("report month = 6", report.month === 6);
  ok("periodFrom = 2026-06-01", report.periodFrom === "2026-06-01");
  ok("periodTo = 2026-06-30", report.periodTo === "2026-06-30");
  ok(
    "payeeCount = 10 (all employees have sheets)",
    report.payeeCount === 10,
    `got ${report.payeeCount}`,
  );
  ok(
    "entries.length = 10",
    report.entries.length === 10,
    `got ${report.entries.length}`,
  );

  // ── 3. Internal consistency: totals = sum of entries ──────────────────────
  console.log("\n3. Internal consistency checks");
  const sumGross = report.entries.reduce(
    (acc, e) => acc + BigInt(e.totalGrossCompensationCents),
    0n,
  );
  const sumWht = report.entries.reduce(
    (acc, e) => acc + BigInt(e.totalWithholdingTaxCents),
    0n,
  );
  ok(
    "totalGrossCompensationCents = sum of entries",
    BigInt(report.totalGrossCompensationCents) === sumGross,
    `report=${report.totalGrossCompensationCents}, sum=${sumGross}`,
  );
  ok(
    "totalWithholdingTaxCents = sum of entries",
    BigInt(report.totalWithholdingTaxCents) === sumWht,
    `report=${report.totalWithholdingTaxCents}, sum=${sumWht}`,
  );
  ok(
    "totalWithholdingTaxCents > 0 (Roberto has WHT)",
    BigInt(report.totalWithholdingTaxCents) > 0n,
    `₱${(Number(BigInt(report.totalWithholdingTaxCents)) / 100).toFixed(2)}`,
  );

  // ── 4. Roberto's entry ─────────────────────────────────────────────────────
  console.log("\n4. Roberto Aquino entry");
  const robEntry = report.entries.find(
    (e) => e.employeeId === ROBERTO_ID,
  );
  ok("Roberto entry exists", Boolean(robEntry));
  if (robEntry) {
    ok(
      "Roberto grossComp > 0",
      BigInt(robEntry.totalGrossCompensationCents) > 0n,
      `₱${(Number(BigInt(robEntry.totalGrossCompensationCents)) / 100).toFixed(2)}`,
    );
    ok(
      "Roberto wht > 0",
      BigInt(robEntry.totalWithholdingTaxCents) > 0n,
      `₱${(Number(BigInt(robEntry.totalWithholdingTaxCents)) / 100).toFixed(2)}`,
    );
    ok(
      "Roberto taxable > 0",
      BigInt(robEntry.totalTaxableCompensationCents) > 0n,
    );
    ok("Roberto tin = null", robEntry.tin === null);
    ok("Roberto payPeriodCount = 1", robEntry.payPeriodCount === 1);
  }

  // ── 5. Entries sorted by lastName ─────────────────────────────────────────
  console.log("\n5. Entries sorted by lastName");
  const isSorted = report.entries.every(
    (e, i) =>
      i === 0 ||
      e.lastName.localeCompare(report.entries[i - 1]!.lastName) >= 0,
  );
  ok("entries sorted by lastName asc", isSorted);

  // ── 6. Empty-month report (May 2026 — no FINALIZED runs) ──────────────────
  console.log("\n6. Empty month (May 2026 → no FINALIZED runs)");
  const emptyReport = await queryAndBuildReport(2026, 5);
  ok("empty report payeeCount = 0", emptyReport.payeeCount === 0);
  ok("empty report entries.length = 0", emptyReport.entries.length === 0);
  ok("empty totalWht = 0", emptyReport.totalWithholdingTaxCents === "0");
  ok("empty periodFrom = 2026-05-01", emptyReport.periodFrom === "2026-05-01");
  ok("empty periodTo = 2026-05-31", emptyReport.periodTo === "2026-05-31");

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n--- E2 smoke: ${total - failures}/${total} passed ---\n`);
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
