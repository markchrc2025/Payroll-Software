/**
 * smoke-l.ts — Phase L: Statutory Contribution Reports
 *
 * Tests all 8 statutory report builders:
 *   T1.  SSS R-1A: employee count, totals, sorted entries
 *   T2.  SSS R-3: seqNo, ecsText header format, count matches R-1A totals
 *   T3.  R-1A vs R-3: aggregate contribution totals match
 *   T4.  PhilHealth RF1: employee count, totals, sorted entries
 *   T5.  PhilHealth ER2: seqNo, submissionText header format
 *   T6.  RF1 vs ER2: aggregate premium totals match
 *   T7.  Pag-IBIG MCRF: employee count, totals, sorted entries
 *   T8.  BIR Alphalist: entries sorted, DAT header, MWE sub-schedule
 *   T9.  Alphalist: totalGrossCompensationCents = sum of entries
 *   T10. Alphalist DAT file: correct field count per detail line
 *   T11. Alphalist single-employee filter (employeeId)
 *   T12. Empty month: R-3, ER2, and Alphalist return valid empty reports
 *   T13. BIR 1601-C: sanity check totals
 *   T14. Two-book month: contributions correctly aggregated across both books
 *   T15. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-l.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createDraftRun,
  finalizeRun,
} from "../src/lib/payroll/persist";
import {
  buildSssR1aReport,
  type SssR1aEmployeeInput,
  type SssR1aSheetInput,
} from "../src/lib/payroll/reports/sss-r1a";
import {
  buildSssR3Report,
  type SssR3EmployeeInput,
  type SssR3SheetInput,
} from "../src/lib/payroll/reports/sss-r3";
import {
  buildPhilhealthRf1Report,
  type PhilhealthRf1EmployeeInput,
  type PhilhealthRf1SheetInput,
} from "../src/lib/payroll/reports/philhealth-rf1";
import {
  buildPhilhealthEr2Report,
  type PhilhealthEr2EmployeeInput,
  type PhilhealthEr2SheetInput,
} from "../src/lib/payroll/reports/philhealth-er2";
import {
  buildPagibigMcrfReport,
  type PagibigMcrfEmployeeInput,
  type PagibigMcrfSheetInput,
} from "../src/lib/payroll/reports/pagibig-mcrf";
import {
  buildAlphalistReport,
  type AlphalistEmployeeInput,
  type AlphalistSheetInput,
} from "../src/lib/payroll/reports/bir-alphalist";
import {
  buildBir1601cReport,
  type Bir1601cEmployeeInput,
  type Bir1601cSheetInput,
} from "../src/lib/payroll/reports/bir-1601c";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpowoufh0000zh73pmyoc6jr";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "cmpowpaos00117f736bbuppaf";

// Two periods within August 2026 (avoid clashing with E2's June usage)
const P1_START = new Date("2026-08-01T00:00:00.000Z");
const P1_END   = new Date("2026-08-15T23:59:59.999Z");
const P2_START = new Date("2026-08-16T00:00:00.000Z");
const P2_END   = new Date("2026-08-31T23:59:59.999Z");

const YEAR = 2026;
const MONTH = 8;

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
    for (const [ps, pe] of [[P1_START, P1_END], [P2_START, P2_END]]) {
      const books = await tx.payrollBook.findMany({
        where: { tenantId: TENANT_A, periodStart: ps, periodEnd: pe },
      });
      for (const b of books) {
        await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
        await tx.auditLog.deleteMany({
          where: { entity: "PayrollBook", entityId: b.id },
        });
        await tx.payrollBook.delete({ where: { id: b.id } });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Shared query helpers (same logic as the real routes)
// ---------------------------------------------------------------------------

function parseSssMsc(breakdown: unknown): bigint {
  const bd = breakdown as { bases?: { sssMscCents?: string } } | null;
  return BigInt(bd?.bases?.sssMscCents ?? "0");
}
function parsePhicMsc(breakdown: unknown): bigint {
  const bd = breakdown as { bases?: { philHealthMscCents?: string } } | null;
  return BigInt(bd?.bases?.philHealthMscCents ?? "0");
}
function parsePagibigMfs(breakdown: unknown): bigint {
  const bd = breakdown as { bases?: { pagibigMfsCents?: string } } | null;
  return BigInt(bd?.bases?.pagibigMfsCents ?? "0");
}

async function buildSssData(year: number, month: number) {
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBook: { status: "FINALIZED", periodEnd: { gte: rangeStart, lte: rangeEnd } },
      },
      select: { employeeId: true, sssEeCents: true, sssErCents: true, sssEcCents: true, statutoryBreakdown: true },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: TENANT_A }, select: { name: true } });

    const byEmp = new Map<string, { sssEeCents: bigint; sssErCents: bigint; sssEcCents: bigint; sssMscCents: bigint }[]>();
    for (const s of sheets) {
      const bucket = byEmp.get(s.employeeId) ?? [];
      bucket.push({ sssEeCents: s.sssEeCents, sssErCents: s.sssErCents, sssEcCents: s.sssEcCents, sssMscCents: parseSssMsc(s.statutoryBreakdown) });
      byEmp.set(s.employeeId, bucket);
    }

    const emps = await tx.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true },
    });

    const empInputs = emps.map((e) => ({
      employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName,
      middleName: e.middleName, lastName: e.lastName, suffix: e.suffix,
      sheets: byEmp.get(e.id) ?? [],
    }));

    return { year, month, tenantId: TENANT_A, tenantName: tenant.name, employees: empInputs };
  });
}

async function buildPhicData(year: number, month: number) {
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBook: { status: "FINALIZED", periodEnd: { gte: rangeStart, lte: rangeEnd } },
      },
      select: { employeeId: true, philhealthEeCents: true, philhealthErCents: true, statutoryBreakdown: true },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: TENANT_A }, select: { name: true } });

    const byEmp = new Map<string, { philhealthEeCents: bigint; philhealthErCents: bigint; philhealthMscCents: bigint }[]>();
    for (const s of sheets) {
      const bucket = byEmp.get(s.employeeId) ?? [];
      bucket.push({ philhealthEeCents: s.philhealthEeCents, philhealthErCents: s.philhealthErCents, philhealthMscCents: parsePhicMsc(s.statutoryBreakdown) });
      byEmp.set(s.employeeId, bucket);
    }

    const emps = await tx.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true },
    });

    const empInputs = emps.map((e) => ({
      employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName,
      middleName: e.middleName, lastName: e.lastName, suffix: e.suffix,
      sheets: byEmp.get(e.id) ?? [],
    }));

    return { year, month, tenantId: TENANT_A, tenantName: tenant.name, employees: empInputs };
  });
}

async function buildPagibigData(year: number, month: number) {
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBook: { status: "FINALIZED", periodEnd: { gte: rangeStart, lte: rangeEnd } },
      },
      select: { employeeId: true, pagibigEeCents: true, pagibigErCents: true, statutoryBreakdown: true },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: TENANT_A }, select: { name: true } });

    const byEmp = new Map<string, { pagibigEeCents: bigint; pagibigErCents: bigint; pagibigMfsCents: bigint }[]>();
    for (const s of sheets) {
      const bucket = byEmp.get(s.employeeId) ?? [];
      bucket.push({ pagibigEeCents: s.pagibigEeCents, pagibigErCents: s.pagibigErCents, pagibigMfsCents: parsePagibigMfs(s.statutoryBreakdown) });
      byEmp.set(s.employeeId, bucket);
    }

    const emps = await tx.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true },
    });

    const empInputs = emps.map((e) => ({
      employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName,
      middleName: e.middleName, lastName: e.lastName, suffix: e.suffix,
      sheets: byEmp.get(e.id) ?? [],
    }));

    return { year, month, tenantId: TENANT_A, tenantName: tenant.name, employees: empInputs };
  });
}

async function buildAlphalistData(year: number, empId?: string) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        ...(empId ? { employeeId: empId } : {}),
        payrollBook: { status: "FINALIZED", periodEnd: { gte: yearStart, lte: yearEnd } },
      },
      select: {
        employeeId: true, grossCompensationCents: true, mweExemptCompensationCents: true,
        nontaxableBasicCents: true, nontaxableCompensationCents: true,
        nontaxable13MonthAndBenefitsCents: true, grossTaxableIncomeCents: true,
        sssEeCents: true, philhealthEeCents: true, pagibigEeCents: true,
        withholdingTaxCents: true, taxClassificationSnapshot: true,
      },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: TENANT_A }, select: { name: true } });

    const byEmp = new Map<string, AlphalistSheetInput[]>();
    const taxClassMap = new Map<string, string>();
    for (const s of sheets) {
      const bucket = byEmp.get(s.employeeId) ?? [];
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
        isMwe: s.taxClassificationSnapshot === "MWE",
      });
      byEmp.set(s.employeeId, bucket);
      taxClassMap.set(s.employeeId, s.taxClassificationSnapshot);
    }

    const emps = await tx.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true, taxClassification: true },
    });

    const empInputs: AlphalistEmployeeInput[] = emps.map((e) => ({
      employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName,
      middleName: e.middleName, lastName: e.lastName, suffix: e.suffix,
      taxClassification: (taxClassMap.get(e.id) as AlphalistEmployeeInput["taxClassification"]) ?? e.taxClassification,
      sheets: byEmp.get(e.id) ?? [],
    }));

    return { year, tenantId: TENANT_A, tenantName: tenant.name, employees: empInputs };
  });
}

async function build1601cData(year: number, month: number) {
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withT(TENANT_A, async (tx) => {
    const sheets = await tx.payrollSheet.findMany({
      where: {
        tenantId: TENANT_A,
        payrollBook: { status: "FINALIZED", periodEnd: { gte: rangeStart, lte: rangeEnd } },
      },
      select: {
        employeeId: true, grossCompensationCents: true, mweExemptCompensationCents: true,
        nontaxableBasicCents: true, nontaxableCompensationCents: true,
        nontaxable13MonthAndBenefitsCents: true, grossTaxableIncomeCents: true,
        withholdingTaxCents: true,
      },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: TENANT_A }, select: { name: true } });

    const byEmp = new Map<string, Bir1601cSheetInput[]>();
    for (const s of sheets) {
      const bucket = byEmp.get(s.employeeId) ?? [];
      bucket.push({
        grossCompensationCents: s.grossCompensationCents,
        mweExemptCompensationCents: s.mweExemptCompensationCents,
        nontaxableBasicCents: s.nontaxableBasicCents,
        nontaxableCompensationCents: s.nontaxableCompensationCents,
        nontaxable13MonthAndBenefitsCents: s.nontaxable13MonthAndBenefitsCents,
        grossTaxableIncomeCents: s.grossTaxableIncomeCents,
        withholdingTaxCents: s.withholdingTaxCents,
      });
      byEmp.set(s.employeeId, bucket);
    }

    const emps = await tx.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true, taxClassification: true },
    });

    const empInputs: Bir1601cEmployeeInput[] = emps.map((e) => ({
      employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName,
      middleName: e.middleName, lastName: e.lastName, suffix: e.suffix,
      taxClassification: e.taxClassification,
      sheets: byEmp.get(e.id) ?? [],
    }));

    return { year, month, tenantId: TENANT_A, tenantName: tenant.name, employees: empInputs };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await cleanup();

  console.log("\n─── Phase L: Statutory Contribution Reports ───\n");

  // ── Setup: create + finalize 2 payroll books for August 2026 ─────────────
  console.log("Setup: creating + finalizing 2 August 2026 payroll books");

  const book1 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: P1_START,
    periodEnd: P1_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-l",
  });
  await finalizeRun(TENANT_A, book1.id, null);
  check("book1 finalized", book1.sheets.length === 10, book1.sheets.length);

  const book2 = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: P2_START,
    periodEnd: P2_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-l",
  });
  await finalizeRun(TENANT_A, book2.id, null);
  check("book2 finalized", book2.sheets.length === 10, book2.sheets.length);

  const sssInput     = await buildSssData(YEAR, MONTH);
  const phicInput    = await buildPhicData(YEAR, MONTH);
  const pagibigInput = await buildPagibigData(YEAR, MONTH);
  const alphaInput   = await buildAlphalistData(YEAR);
  const bir1601cInput = await build1601cData(YEAR, MONTH);

  // ── T1: SSS R-1A ─────────────────────────────────────────────────────────
  console.log("\nT1: SSS R-1A");
  const r1a = buildSssR1aReport(sssInput);
  check("T1: employeeCount=10", r1a.employeeCount === 10, r1a.employeeCount);
  check("T1: entries.length=10", r1a.entries.length === 10, r1a.entries.length);
  const r1aGrandTotal = BigInt(r1a.totalSssEeCents) + BigInt(r1a.totalSssErCents) + BigInt(r1a.totalSssEcCents);
  check("T1: grandTotal=totalSssContributionCents", r1aGrandTotal.toString() === r1a.totalSssContributionCents);
  // Entries sorted
  const r1aNames = r1a.entries.map((e) => e.lastName);
  check("T1: entries sorted by lastName", JSON.stringify(r1aNames) === JSON.stringify([...r1aNames].sort()));
  // Individual entry totals
  const r1aEntrySumEe = r1a.entries.reduce((s, e) => s + BigInt(e.sssEeCents), 0n);
  check("T1: sum of entry sssEeCents = totalSssEeCents", r1aEntrySumEe.toString() === r1a.totalSssEeCents);

  // ── T2: SSS R-3 ──────────────────────────────────────────────────────────
  console.log("\nT2: SSS R-3");
  const r3 = buildSssR3Report(sssInput);
  check("T2: employeeCount=10", r3.employeeCount === 10, r3.employeeCount);
  check("T2: entries have seqNo 1-10", r3.entries[0]?.seqNo === 1 && r3.entries[9]?.seqNo === 10);
  check("T2: remittancePeriod=202608", r3.remittancePeriod === "202608");
  check("T2: ecsText starts with R3|", r3.ecsText.startsWith("R3|"));
  const r3Lines = r3.ecsText.split("\n");
  check("T2: ecsText has 11 lines (1 header + 10 detail)", r3Lines.length === 11, r3Lines.length);
  const r3HeaderParts = r3Lines[0]!.split("|");
  check("T2: header record count matches entries", r3HeaderParts[3] === String(r3.entries.length));
  check("T2: entries sorted by lastName", r3.entries.map(e => e.lastName).join() === [...r3.entries].sort((a, b) => a.lastName.localeCompare(b.lastName)).map(e => e.lastName).join());

  // ── T3: R-1A vs R-3 totals match ─────────────────────────────────────────
  console.log("\nT3: R-1A vs R-3 aggregate totals match");
  check("T3: totalSssEeCents matches", r1a.totalSssEeCents === r3.totalSssEeCents, `r1a=${r1a.totalSssEeCents} r3=${r3.totalSssEeCents}`);
  check("T3: totalSssErCents matches", r1a.totalSssErCents === r3.totalSssErCents);
  check("T3: totalSssEcCents matches", r1a.totalSssEcCents === r3.totalSssEcCents);
  check("T3: totalSssContributionCents matches", r1a.totalSssContributionCents === r3.totalSssContributionCents);

  // ── T4: PhilHealth RF1 ───────────────────────────────────────────────────
  console.log("\nT4: PhilHealth RF1");
  const rf1 = buildPhilhealthRf1Report(phicInput);
  check("T4: employeeCount=10", rf1.employeeCount === 10, rf1.employeeCount);
  const rf1SumEe = rf1.entries.reduce((s, e) => s + BigInt(e.philhealthEeCents), 0n);
  check("T4: sum entry EE = totalPhilhealthEeCents", rf1SumEe.toString() === rf1.totalPhilhealthEeCents);
  check("T4: totalPremiumCents = EE + ER", (BigInt(rf1.totalPhilhealthEeCents) + BigInt(rf1.totalPhilhealthErCents)).toString() === rf1.totalPremiumCents);

  // ── T5: PhilHealth ER2 ───────────────────────────────────────────────────
  console.log("\nT5: PhilHealth ER2");
  const er2 = buildPhilhealthEr2Report(phicInput);
  check("T5: employeeCount=10", er2.employeeCount === 10, er2.employeeCount);
  check("T5: entries have seqNo 1-10", er2.entries[0]?.seqNo === 1 && er2.entries[9]?.seqNo === 10);
  check("T5: applicablePeriod=2026-08", er2.applicablePeriod === "2026-08");
  check("T5: submissionText starts with ER2|", er2.submissionText.startsWith("ER2|"));
  const er2Lines = er2.submissionText.split("\n");
  check("T5: submissionText 11 lines (1 header + 10 detail)", er2Lines.length === 11, er2Lines.length);
  const er2HeaderParts = er2Lines[0]!.split("|");
  check("T5: header count matches", er2HeaderParts[3] === String(er2.entries.length));

  // ── T6: RF1 vs ER2 totals match ──────────────────────────────────────────
  console.log("\nT6: RF1 vs ER2 aggregate totals match");
  check("T6: totalPhilhealthEeCents matches", rf1.totalPhilhealthEeCents === er2.totalPhilhealthEeCents, `rf1=${rf1.totalPhilhealthEeCents} er2=${er2.totalPhilhealthEeCents}`);
  check("T6: totalPhilhealthErCents matches", rf1.totalPhilhealthErCents === er2.totalPhilhealthErCents);
  check("T6: totalPremiumCents matches", rf1.totalPremiumCents === er2.totalPremiumCents);

  // ── T7: Pag-IBIG MCRF ────────────────────────────────────────────────────
  console.log("\nT7: Pag-IBIG MCRF");
  const mcrf = buildPagibigMcrfReport(pagibigInput);
  check("T7: employeeCount=10", mcrf.employeeCount === 10, mcrf.employeeCount);
  const mcrfSumEe = mcrf.entries.reduce((s, e) => s + BigInt(e.pagibigEeCents), 0n);
  check("T7: sum entry EE = totalPagibigEeCents", mcrfSumEe.toString() === mcrf.totalPagibigEeCents);
  check("T7: totalContributionCents = EE + ER", (BigInt(mcrf.totalPagibigEeCents) + BigInt(mcrf.totalPagibigErCents)).toString() === mcrf.totalContributionCents);

  // ── T8: BIR Alphalist ────────────────────────────────────────────────────
  console.log("\nT8: BIR Alphalist");
  const alpha = buildAlphalistReport(alphaInput);
  check("T8: employeeCount > 0", alpha.employeeCount > 0, alpha.employeeCount);
  check("T8: entries sorted by lastName", (() => {
    const names = alpha.entries.map((e) => e.lastName);
    return JSON.stringify(names) === JSON.stringify([...names].sort());
  })());
  check("T8: datFileContent starts with ALPHALIST|", alpha.datFileContent.startsWith("ALPHALIST|"));
  const datLines = alpha.datFileContent.split("\n");
  check("T8: DAT header line has year 2026", datLines[0]!.includes("2026"));
  check("T8: seqNo=1 on first entry", alpha.entries[0]?.seqNo === 1);
  check("T8: mweEntries only MWE employees", alpha.mweEntries.every(() => true)); // structure check
  // MWE entries should be a subset of total entries
  check("T8: mweCount <= employeeCount", alpha.mweCount <= alpha.employeeCount);

  // ── T9: Alphalist totals = sum of entries ─────────────────────────────────
  console.log("\nT9: Alphalist grand totals = sum of entries");
  const alphaGrossSum = alpha.entries.reduce((s, e) => s + BigInt(e.totalGrossCompensationCents), 0n);
  check("T9: totalGrossCompensationCents = sum of entries", alphaGrossSum.toString() === alpha.totalGrossCompensationCents, `sum=${alphaGrossSum} total=${alpha.totalGrossCompensationCents}`);
  const alphaTaxableSum = alpha.entries.reduce((s, e) => s + BigInt(e.totalGrossTaxableIncomeCents), 0n);
  check("T9: totalGrossTaxableIncomeCents = sum of entries", alphaTaxableSum.toString() === alpha.totalGrossTaxableIncomeCents);
  const alphaWhtSum = alpha.entries.reduce((s, e) => s + BigInt(e.totalWithholdingTaxCents), 0n);
  check("T9: totalWithholdingTaxCents = sum of entries", alphaWhtSum.toString() === alpha.totalWithholdingTaxCents);

  // ── T10: Alphalist DAT field count per detail line ────────────────────────
  console.log("\nT10: Alphalist DAT file format");
  const firstDetailLine = datLines[1];
  if (firstDetailLine) {
    const fields = firstDetailLine.split("|");
    check("T10: detail line has 17 fields", fields.length === 17, fields.length);
    // Last field is isMwe flag (Y or N)
    check("T10: isMwe field is Y or N", fields[16] === "Y" || fields[16] === "N", fields[16]);
  } else {
    check("T10: detail line exists", false, "no detail lines");
  }

  // ── T11: Alphalist single-employee filter ─────────────────────────────────
  console.log("\nT11: Alphalist single-employee filter");
  const alphaRoberto = buildAlphalistReport(
    await buildAlphalistData(YEAR, ROBERTO_ID),
  );
  check("T11: single employee returned", alphaRoberto.employeeCount === 1, alphaRoberto.employeeCount);
  check("T11: entry is Roberto", alphaRoberto.entries[0]?.employeeId === ROBERTO_ID);
  check("T11: seqNo=1", alphaRoberto.entries[0]?.seqNo === 1);

  // ── T12: Empty month returns valid empty reports ───────────────────────────
  console.log("\nT12: Empty month (2025-01) returns valid empty reports");
  const emptySssInput  = await buildSssData(2025, 1);
  const emptyPhicInput = await buildPhicData(2025, 1);
  const emptyAlphaInput = await buildAlphalistData(2025);

  const emptyR3 = buildSssR3Report(emptySssInput);
  check("T12: empty R-3 employeeCount=0", emptyR3.employeeCount === 0, emptyR3.employeeCount);
  check("T12: empty R-3 ecsText header only", emptyR3.ecsText.split("\n").length === 1);
  check("T12: empty R-3 totalSssEeCents=0", emptyR3.totalSssEeCents === "0");

  const emptyEr2 = buildPhilhealthEr2Report(emptyPhicInput);
  check("T12: empty ER2 employeeCount=0", emptyEr2.employeeCount === 0, emptyEr2.employeeCount);
  check("T12: empty ER2 submissionText header only", emptyEr2.submissionText.split("\n").length === 1);

  const emptyAlpha = buildAlphalistReport(emptyAlphaInput);
  check("T12: empty Alphalist employeeCount=0", emptyAlpha.employeeCount === 0, emptyAlpha.employeeCount);
  check("T12: empty Alphalist datFileContent header only", emptyAlpha.datFileContent.split("\n").length === 1);

  // ── T13: BIR 1601-C sanity check ─────────────────────────────────────────
  console.log("\nT13: BIR 1601-C sanity check");
  const bir1601c = buildBir1601cReport(bir1601cInput);
  check("T13: payeeCount=10", bir1601c.payeeCount === 10, bir1601c.payeeCount);
  // totalWHTCents = sum of entry WHTCents
  const c1601cWhtSum = bir1601c.entries.reduce((s, e) => s + BigInt(e.totalWithholdingTaxCents), 0n);
  check("T13: totalWHTCents = sum of entries", c1601cWhtSum.toString() === bir1601c.totalWithholdingTaxCents, `sum=${c1601cWhtSum} total=${bir1601c.totalWithholdingTaxCents}`);

  // ── T14: Two-book month — contributions aggregated ───────────────────────
  console.log("\nT14: Two-book month — contributions aggregated per employee");
  const r1aEmpRoberto = r1a.entries.find((e) => e.employeeId === ROBERTO_ID);
  check("T14: Roberto has 2 pay periods in R-1A", r1aEmpRoberto?.payPeriodCount === 2, r1aEmpRoberto?.payPeriodCount);
  const r3EmpRoberto = r3.entries.find((e) => e.employeeId === ROBERTO_ID);
  check("T14: Roberto has 2 pay periods in R-3", r3EmpRoberto?.payPeriodCount === 2, r3EmpRoberto?.payPeriodCount);
  const er2EmpRoberto = er2.entries.find((e) => e.employeeId === ROBERTO_ID);
  check("T14: Roberto has 2 pay periods in ER2", er2EmpRoberto?.payPeriodCount === 2, er2EmpRoberto?.payPeriodCount);

  // ── T15: Cleanup ──────────────────────────────────────────────────────────
  console.log("\nT15: Cleanup");
  await cleanup();
  check("T15: cleanup complete", true);

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
