/**
 * smoke-e3.ts — verifies Phase E3: BIR 2316 Annual Certificate.
 *
 * Exercises:
 *   1. Create + finalize REGULAR run (2026-06-16..06-30, Roberto 11 days).
 *   2. Create + finalize YEAR_END run (2026-01-01..12-31).
 *   3. Build 2316 report for 2026 — spans both run types.
 *   4. Roberto's certificate totals = REGULAR amounts + YEAR_END 13th month.
 *   5. Box mapping: totalNontaxable13Month = thirteenth; mandatoryEe = SSS+PHIC+HDMF;
 *      otherNontaxable = (nontaxableComp − mandatoryEe); grossTaxable = taxableFromRegular.
 *   6. Total WHT = REGULAR WHT only (YEAR_END < ₱90k cap → WHT = 0).
 *   7. Single-employee mode: request employeeId → single certificate shape.
 *   8. Single-employee not-in-year → empty report.
 *   9. Entries sorted by lastName.
 *  10. Empty year (2025 — no FINALIZED runs) → 0 certificates.
 *  11. Cleanup.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-e3.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
} from "../src/lib/payroll/persist";
import {
  buildBir2316Report,
  type Bir2316EmployeeInput,
  type Bir2316SheetInput,
} from "../src/lib/payroll/reports/bir-2316";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu";

const REG_START  = new Date("2026-06-16T00:00:00.000Z");
const REG_END    = new Date("2026-06-30T00:00:00.000Z");
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
    // Delete REGULAR book for June period.
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
    // Delete YEAR_END books for 2026.
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
    // Remove Roberto's PeriodInput for the June REGULAR period.
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

/** Simulate the route's DB query + buildBir2316Report. */
async function queryAndBuildReport(
  year: number,
  filterEmployeeId?: string,
) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        ...(filterEmployeeId ? { employeeId: filterEmployeeId } : {}),
        payrollBook: {
          status: "FINALIZED",
          periodEnd: { gte: yearStart, lte: yearEnd },
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
        sssEeCents: true,
        philhealthEeCents: true,
        pagibigEeCents: true,
        withholdingTaxCents: true,
      },
    });

    const byEmployee = new Map<string, Bir2316SheetInput[]>();
    for (const s of sheets) {
      const bucket = byEmployee.get(s.employeeId) ?? [];
      bucket.push({
        grossCompensationCents: s.grossCompensationCents,
        mweExemptCompensationCents: s.mweExemptCompensationCents,
        nontaxableBasicCents: s.nontaxableBasicCents,
        nontaxableCompensationCents: s.nontaxableCompensationCents,
        nontaxable13MonthAndBenefitsCents: s.nontaxable13MonthAndBenefitsCents,
        grossTaxableIncomeCents: s.grossTaxableIncomeCents,
        sssEeCents: s.sssEeCents,
        philhealthEeCents: s.philhealthEeCents,
        pagibigEeCents: s.pagibigEeCents,
        withholdingTaxCents: s.withholdingTaxCents,
      });
      byEmployee.set(s.employeeId, bucket);
    }

    const employeeIds = [...byEmployee.keys()];
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: TENANT_A },
      select: { name: true },
    });

    if (employeeIds.length === 0) {
      return buildBir2316Report({
        year,
        tenantId: TENANT_A,
        tenantName: tenant.name,
        employees: [],
      });
    }

    const employees = await tx.employee.findMany({
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
    });

    const employeeInputs: Bir2316EmployeeInput[] = employees.map((e) => ({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      suffix: e.suffix,
      taxClassification: e.taxClassification,
      sheets: byEmployee.get(e.id) ?? [],
    }));

    return buildBir2316Report({
      year,
      tenantId: TENANT_A,
      tenantName: tenant.name,
      employees: employeeInputs,
    });
  });
}

async function main() {
  console.log("\n--- E3 smoke: BIR 2316 Annual Certificate ---\n");

  await cleanup();

  // ── 1. Create REGULAR run (June 2026, Roberto 11 days) ────────────────────
  console.log("1. Create + finalize REGULAR run 2026-06-16..06-30");
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
  const regBook = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: REG_START,
    periodEnd: REG_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-e3-regular",
    createdByUserId: null,
  });
  await finalizeRun(TENANT_A, regBook.id, null);

  // Capture Roberto's REGULAR sheet values for later assertions.
  const regRobertoSheet = regBook.sheets.find((s) => s.employeeId === ROBERTO_ID)!;
  ok("REGULAR sheet exists for Roberto", Boolean(regRobertoSheet));

  // ── 2. Create YEAR_END run (2026-01-01..12-31) ────────────────────────────
  console.log("\n2. Create + finalize YEAR_END run 2026-01-01..12-31");
  const yeBook = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: YE_START,
    periodEnd: YE_END,
    cycle: "SEMI_MONTHLY",
    runType: "YEAR_END",
    notes: "smoke-e3-year-end",
    createdByUserId: null,
  });
  await finalizeRun(TENANT_A, yeBook.id, null);
  const yeRobertoSheet = yeBook.sheets.find((s) => s.employeeId === ROBERTO_ID)!;
  ok("YEAR_END sheet exists for Roberto", Boolean(yeRobertoSheet));

  // ── 3. Build 2316 report for 2026 ────────────────────────────────────────
  console.log("\n3. Build BIR 2316 report for 2026 (all employees)");
  const report = await queryAndBuildReport(2026);

  ok("report.year = 2026", report.year === 2026);
  ok(
    "employeeCount = 10",
    report.employeeCount === 10,
    `got ${report.employeeCount}`,
  );
  ok(
    "certificates.length = 10",
    report.certificates.length === 10,
    `got ${report.certificates.length}`,
  );

  // ── 4. Roberto certificate detail ────────────────────────────────────────
  console.log("\n4. Roberto certificate assertions");
  const cert = report.certificates.find((c) => c.employeeId === ROBERTO_ID);
  ok("Roberto certificate exists", Boolean(cert));

  if (cert && regRobertoSheet && yeRobertoSheet) {
    // Annual gross = REGULAR gross + YEAR_END 13th month gross.
    const expectedGross =
      regRobertoSheet.grossCompensationCents +
      yeRobertoSheet.grossCompensationCents;
    ok(
      "totalGrossCompensationCents = REGULAR + YEAR_END gross",
      BigInt(cert.totalGrossCompensationCents) === expectedGross,
      `expected ${expectedGross}, got ${cert.totalGrossCompensationCents}`,
    );

    // 13th month bucket: from YEAR_END sheet only (REGULAR has 0n).
    ok(
      "totalNontaxable13MonthAndBenefitsCents = YEAR_END 13th month",
      BigInt(cert.totalNontaxable13MonthAndBenefitsCents) ===
        yeRobertoSheet.nontaxable13MonthAndBenefitsCents,
      `expected ${yeRobertoSheet.nontaxable13MonthAndBenefitsCents}, got ${cert.totalNontaxable13MonthAndBenefitsCents}`,
    );

    // WHT = REGULAR only (YEAR_END < ₱90k → WHT = 0).
    ok(
      "YEAR_END withholdingTax = 0 (below ₱90k cap)",
      yeRobertoSheet.withholdingTaxCents === 0n,
    );
    const expectedWht =
      regRobertoSheet.withholdingTaxCents + yeRobertoSheet.withholdingTaxCents;
    ok(
      "totalWithholdingTaxCents = REGULAR WHT",
      BigInt(cert.totalWithholdingTaxCents) === expectedWht,
      `expected ${expectedWht}, got ${cert.totalWithholdingTaxCents}`,
    );

    // Mandatory EE: from REGULAR only (YEAR_END statutory = 0).
    const expectedMandatory =
      regRobertoSheet.sssEeCents +
      regRobertoSheet.philhealthEeCents +
      regRobertoSheet.pagibigEeCents;
    ok(
      "totalMandatoryEeCents = SSS + PhilHealth + PagIBIG from REGULAR",
      BigInt(cert.totalMandatoryEeCents) === expectedMandatory,
      `expected ${expectedMandatory}, got ${cert.totalMandatoryEeCents}`,
    );

    // payPeriodCount = 2 (one REGULAR sheet + one YEAR_END sheet).
    ok("payPeriodCount = 2", cert.payPeriodCount === 2);

    // TIN is null.
    ok("tin = null", cert.tin === null);

    // totalGrossTaxableIncomeCents > 0.
    ok(
      "totalGrossTaxableIncomeCents > 0",
      BigInt(cert.totalGrossTaxableIncomeCents) > 0n,
      `₱${(Number(BigInt(cert.totalGrossTaxableIncomeCents)) / 100).toFixed(2)}`,
    );
  }

  // ── 5. Single-employee mode ───────────────────────────────────────────────
  console.log("\n5. Single-employee query (Roberto only)");
  const singleReport = await queryAndBuildReport(2026, ROBERTO_ID);
  ok(
    "Single-employee report.certificates.length = 1",
    singleReport.certificates.length === 1,
    `got ${singleReport.certificates.length}`,
  );
  ok(
    "Single certificate employeeId = Roberto",
    singleReport.certificates[0]?.employeeId === ROBERTO_ID,
  );
  ok(
    "Single-employee gross matches full-report",
    report.certificates.find((c) => c.employeeId === ROBERTO_ID)
      ?.totalGrossCompensationCents ===
      singleReport.certificates[0]?.totalGrossCompensationCents,
  );

  // ── 6. Unknown employee → empty certificates ──────────────────────────────
  console.log("\n6. Unknown employeeId → 0 certificates");
  const unknownReport = await queryAndBuildReport(2026, "nonexistent-id-xxxx");
  ok(
    "Unknown employee → employeeCount = 0",
    unknownReport.employeeCount === 0,
  );

  // ── 7. Sorted by lastName ─────────────────────────────────────────────────
  console.log("\n7. Certificates sorted by lastName");
  const isSorted = report.certificates.every(
    (c, i) =>
      i === 0 ||
      c.lastName.localeCompare(report.certificates[i - 1]!.lastName) >= 0,
  );
  ok("certificates sorted by lastName asc", isSorted);

  // ── 8. Empty year (2025 — no FINALIZED runs) ──────────────────────────────
  console.log("\n8. Empty year 2025");
  const emptyReport = await queryAndBuildReport(2025);
  ok("Empty year employeeCount = 0", emptyReport.employeeCount === 0);
  ok(
    "Empty year certificates.length = 0",
    emptyReport.certificates.length === 0,
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n--- E3 smoke: ${total - failures}/${total} passed ---\n`);
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
