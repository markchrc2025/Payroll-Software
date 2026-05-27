/**
 * smoke-e4.ts — verifies Phase E4: Statutory Contribution Schedules.
 *
 * Exercises:
 *   1. Create + finalize REGULAR run (2026-06-16..06-30, Roberto 11 days).
 *   2. Build SSS R-1A for June 2026:
 *      a. employeeCount = 10
 *      b. Roberto sssEeCents matches sheet value
 *      c. Roberto sssNumber = null
 *      d. Roberto sssMscCents > 0
 *      e. totalSssContributionCents = EE + ER + EC across all
 *      f. entries sorted by lastName
 *      g. Empty month (May 2026) → employeeCount = 0
 *   3. Build PhilHealth RF1 for June 2026:
 *      a. employeeCount = 10
 *      b. Roberto philhealthEeCents matches sheet value
 *      c. Roberto philhealthNumber = null
 *      d. Roberto philhealthMscCents > 0
 *      e. totalPremiumCents = sum(EE + ER) across all
 *      f. entries sorted by lastName
 *      g. Empty month → employeeCount = 0
 *   4. Build PagIBIG MCRF for June 2026:
 *      a. employeeCount = 10
 *      b. Roberto pagibigEeCents matches sheet value
 *      c. Roberto pagibigNumber = null
 *      d. Roberto pagibigMfsCents > 0
 *      e. totalContributionCents = sum(EE + ER) across all
 *      f. entries sorted by lastName
 *      g. Empty month → employeeCount = 0
 *   5. Cleanup.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-e4.ts
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
  buildPhilhealthRf1Report,
  type PhilhealthRf1EmployeeInput,
  type PhilhealthRf1SheetInput,
} from "../src/lib/payroll/reports/philhealth-rf1";
import {
  buildPagibigMcrfReport,
  type PagibigMcrfEmployeeInput,
  type PagibigMcrfSheetInput,
} from "../src/lib/payroll/reports/pagibig-mcrf";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";
const ROBERTO_ID = "cmpnn0s720012yi73vv5f1bxu";

const REG_START = new Date("2026-06-16T00:00:00.000Z");
const REG_END   = new Date("2026-06-30T00:00:00.000Z");

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
      where: { tenantId: TENANT_A, periodStart: REG_START, periodEnd: REG_END },
    });
    for (const b of books) {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
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

/** Parse sssMscCents from a statutoryBreakdown JSON value. */
function parseSssMsc(bd: unknown): bigint {
  const o = bd as { bases?: { sssMscCents?: string } } | null;
  return BigInt(o?.bases?.sssMscCents ?? "0");
}
function parsePhilhealthMsc(bd: unknown): bigint {
  const o = bd as { bases?: { philHealthMscCents?: string } } | null;
  return BigInt(o?.bases?.philHealthMscCents ?? "0");
}
function parsePagibigMfs(bd: unknown): bigint {
  const o = bd as { bases?: { pagibigMfsCents?: string } } | null;
  return BigInt(o?.bases?.pagibigMfsCents ?? "0");
}

/** Simulate the route's DB query for a statutory report month. */
async function querySheets(year: number, month: number) {
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
        sssEeCents: true,
        sssErCents: true,
        sssEcCents: true,
        philhealthEeCents: true,
        philhealthErCents: true,
        pagibigEeCents: true,
        pagibigErCents: true,
        statutoryBreakdown: true,
      },
    });

    if (sheets.length === 0) return { sheets: [], employees: [] as Awaited<ReturnType<typeof tx.employee.findMany<{ where: { id: { in: string[] } }, select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true } }>>> };

    const empIds = [...new Set(sheets.map((s) => s.employeeId))];
    const employees = await tx.employee.findMany({
      where: { id: { in: empIds } },
      select: {
        id: true, employeeNumber: true, firstName: true,
        middleName: true, lastName: true, suffix: true,
      },
    });

    return { sheets, employees };
  });
}

function buildInputs(
  sheets: Awaited<ReturnType<typeof querySheets>>["sheets"],
  employees: Awaited<ReturnType<typeof querySheets>>["employees"],
  year: number,
  month: number,
) {
  type SssSheet   = SssR1aSheetInput;
  type PhicSheet  = PhilhealthRf1SheetInput;
  type HdmfSheet  = PagibigMcrfSheetInput;

  const bySss   = new Map<string, SssSheet[]>();
  const byPhic  = new Map<string, PhicSheet[]>();
  const byHdmf  = new Map<string, HdmfSheet[]>();

  for (const s of sheets) {
    const bd = s.statutoryBreakdown;
    bySss.set(s.employeeId, [...(bySss.get(s.employeeId) ?? []), {
      sssEeCents: s.sssEeCents,
      sssErCents: s.sssErCents,
      sssEcCents: s.sssEcCents,
      sssMscCents: parseSssMsc(bd),
    }]);
    byPhic.set(s.employeeId, [...(byPhic.get(s.employeeId) ?? []), {
      philhealthEeCents: s.philhealthEeCents,
      philhealthErCents: s.philhealthErCents,
      philhealthMscCents: parsePhilhealthMsc(bd),
    }]);
    byHdmf.set(s.employeeId, [...(byHdmf.get(s.employeeId) ?? []), {
      pagibigEeCents: s.pagibigEeCents,
      pagibigErCents: s.pagibigErCents,
      pagibigMfsCents: parsePagibigMfs(bd),
    }]);
  }

  const sssEmps:  SssR1aEmployeeInput[]       = employees.map((e) => ({ employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName, middleName: e.middleName, lastName: e.lastName, suffix: e.suffix, sheets: bySss.get(e.id)  ?? [] }));
  const phicEmps: PhilhealthRf1EmployeeInput[] = employees.map((e) => ({ employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName, middleName: e.middleName, lastName: e.lastName, suffix: e.suffix, sheets: byPhic.get(e.id) ?? [] }));
  const hdmfEmps: PagibigMcrfEmployeeInput[]   = employees.map((e) => ({ employeeId: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName, middleName: e.middleName, lastName: e.lastName, suffix: e.suffix, sheets: byHdmf.get(e.id) ?? [] }));

  return {
    sssReport: buildSssR1aReport({ year, month, tenantId: TENANT_A, tenantName: "Demo", employees: sssEmps }),
    phicReport: buildPhilhealthRf1Report({ year, month, tenantId: TENANT_A, tenantName: "Demo", employees: phicEmps }),
    hdmfReport: buildPagibigMcrfReport({ year, month, tenantId: TENANT_A, tenantName: "Demo", employees: hdmfEmps }),
  };
}

async function main() {
  console.log("\n--- E4 smoke: Statutory Contribution Schedules ---\n");

  await cleanup();

  // ── 1. Create + finalize REGULAR run ─────────────────────────────────────
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
  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: REG_START,
    periodEnd: REG_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    notes: "smoke-e4",
    createdByUserId: null,
  });
  await finalizeRun(TENANT_A, book.id, null);

  const roberto = book.sheets.find((s) => s.employeeId === ROBERTO_ID)!;
  ok("REGULAR sheet exists for Roberto", Boolean(roberto));

  // ── 2. Query June 2026 sheets ─────────────────────────────────────────────
  console.log("\n2. Query June 2026 FINALIZED sheets");
  const { sheets: juneSheets, employees: juneEmps } = await querySheets(2026, 6);
  ok("10 sheets in June 2026", juneSheets.length === 10, `got ${juneSheets.length}`);

  const { sssReport, phicReport, hdmfReport } = buildInputs(juneSheets, juneEmps, 2026, 6);

  // ── 3. SSS R-1A assertions ────────────────────────────────────────────────
  console.log("\n3. SSS R-1A — June 2026");
  ok("sss.year = 2026", sssReport.year === 2026);
  ok("sss.month = 6", sssReport.month === 6);
  ok("sss.periodFrom = 2026-06-01", sssReport.periodFrom === "2026-06-01");
  ok("sss.periodTo = 2026-06-30", sssReport.periodTo === "2026-06-30");
  ok("sss.employeeCount = 10", sssReport.employeeCount === 10, `got ${sssReport.employeeCount}`);
  ok("sss.entries.length = 10", sssReport.entries.length === 10);

  const sssRoberto = sssReport.entries.find((e) => e.employeeId === ROBERTO_ID);
  ok("SSS Roberto entry exists", Boolean(sssRoberto));
  if (sssRoberto) {
    ok(
      "SSS Roberto EE = sheet value",
      BigInt(sssRoberto.sssEeCents) === roberto.sssEeCents,
      `expected ${roberto.sssEeCents}, got ${sssRoberto.sssEeCents}`,
    );
    ok(
      "SSS Roberto ER = sheet value",
      BigInt(sssRoberto.sssErCents) === roberto.sssErCents,
      `expected ${roberto.sssErCents}, got ${sssRoberto.sssErCents}`,
    );
    ok("SSS Roberto sssNumber = null", sssRoberto.sssNumber === null);
    ok(
      "SSS Roberto sssMscCents > 0",
      BigInt(sssRoberto.sssMscCents) > 0n,
      `₱${(Number(BigInt(sssRoberto.sssMscCents)) / 100).toFixed(2)}`,
    );
    ok(
      "SSS Roberto totalSssCents = EE + ER + EC",
      BigInt(sssRoberto.totalSssContributionCents) ===
        BigInt(sssRoberto.sssEeCents) + BigInt(sssRoberto.sssErCents) + BigInt(sssRoberto.sssEcCents),
    );
  }

  // Grand total consistency check.
  const sssGrandTotal = sssReport.entries.reduce(
    (acc, e) => acc + BigInt(e.totalSssContributionCents), 0n,
  );
  ok(
    "SSS grand total = sum of entry totals",
    BigInt(sssReport.totalSssContributionCents) === sssGrandTotal,
  );

  // Sorted.
  const sssSorted = sssReport.entries.every(
    (e, i) =>
      i === 0 ||
      e.lastName.localeCompare(sssReport.entries[i - 1]!.lastName) >= 0,
  );
  ok("SSS entries sorted by lastName", sssSorted);

  // ── 4. PhilHealth RF1 assertions ─────────────────────────────────────────
  console.log("\n4. PhilHealth RF1 — June 2026");
  ok("phic.employeeCount = 10", phicReport.employeeCount === 10, `got ${phicReport.employeeCount}`);
  ok("phic.entries.length = 10", phicReport.entries.length === 10);

  const phicRoberto = phicReport.entries.find((e) => e.employeeId === ROBERTO_ID);
  ok("PHIC Roberto entry exists", Boolean(phicRoberto));
  if (phicRoberto) {
    ok(
      "PHIC Roberto EE = sheet value",
      BigInt(phicRoberto.philhealthEeCents) === roberto.philhealthEeCents,
      `expected ${roberto.philhealthEeCents}, got ${phicRoberto.philhealthEeCents}`,
    );
    ok(
      "PHIC Roberto ER = sheet value",
      BigInt(phicRoberto.philhealthErCents) === roberto.philhealthErCents,
      `expected ${roberto.philhealthErCents}, got ${phicRoberto.philhealthErCents}`,
    );
    ok("PHIC Roberto philhealthNumber = null", phicRoberto.philhealthNumber === null);
    ok(
      "PHIC Roberto philhealthMscCents > 0",
      BigInt(phicRoberto.philhealthMscCents) > 0n,
      `₱${(Number(BigInt(phicRoberto.philhealthMscCents)) / 100).toFixed(2)}`,
    );
    ok(
      "PHIC Roberto totalPremiumCents = EE + ER",
      BigInt(phicRoberto.totalPremiumCents) ===
        BigInt(phicRoberto.philhealthEeCents) + BigInt(phicRoberto.philhealthErCents),
    );
  }

  const phicGrand = phicReport.entries.reduce(
    (acc, e) => acc + BigInt(e.totalPremiumCents), 0n,
  );
  ok("PHIC grand totalPremiumCents = sum of entry totals", BigInt(phicReport.totalPremiumCents) === phicGrand);

  const phicSorted = phicReport.entries.every(
    (e, i) =>
      i === 0 ||
      e.lastName.localeCompare(phicReport.entries[i - 1]!.lastName) >= 0,
  );
  ok("PHIC entries sorted by lastName", phicSorted);

  // ── 5. PagIBIG MCRF assertions ────────────────────────────────────────────
  console.log("\n5. PagIBIG MCRF — June 2026");
  ok("hdmf.employeeCount = 10", hdmfReport.employeeCount === 10, `got ${hdmfReport.employeeCount}`);
  ok("hdmf.entries.length = 10", hdmfReport.entries.length === 10);

  const hdmfRoberto = hdmfReport.entries.find((e) => e.employeeId === ROBERTO_ID);
  ok("HDMF Roberto entry exists", Boolean(hdmfRoberto));
  if (hdmfRoberto) {
    ok(
      "HDMF Roberto EE = sheet value",
      BigInt(hdmfRoberto.pagibigEeCents) === roberto.pagibigEeCents,
      `expected ${roberto.pagibigEeCents}, got ${hdmfRoberto.pagibigEeCents}`,
    );
    ok(
      "HDMF Roberto ER = sheet value",
      BigInt(hdmfRoberto.pagibigErCents) === roberto.pagibigErCents,
      `expected ${roberto.pagibigErCents}, got ${hdmfRoberto.pagibigErCents}`,
    );
    ok("HDMF Roberto pagibigNumber = null", hdmfRoberto.pagibigNumber === null);
    ok(
      "HDMF Roberto pagibigMfsCents > 0",
      BigInt(hdmfRoberto.pagibigMfsCents) > 0n,
      `₱${(Number(BigInt(hdmfRoberto.pagibigMfsCents)) / 100).toFixed(2)}`,
    );
    ok(
      "HDMF Roberto totalContributionCents = EE + ER",
      BigInt(hdmfRoberto.totalContributionCents) ===
        BigInt(hdmfRoberto.pagibigEeCents) + BigInt(hdmfRoberto.pagibigErCents),
    );
  }

  const hdmfGrand = hdmfReport.entries.reduce(
    (acc, e) => acc + BigInt(e.totalContributionCents), 0n,
  );
  ok("HDMF grand totalContributionCents = sum of entry totals", BigInt(hdmfReport.totalContributionCents) === hdmfGrand);

  const hdmfSorted = hdmfReport.entries.every(
    (e, i) =>
      i === 0 ||
      e.lastName.localeCompare(hdmfReport.entries[i - 1]!.lastName) >= 0,
  );
  ok("HDMF entries sorted by lastName", hdmfSorted);

  // ── 6. Empty month (May 2026) ─────────────────────────────────────────────
  console.log("\n6. Empty month May 2026");
  const { sheets: maySheets, employees: mayEmps } = await querySheets(2026, 5);
  const { sssReport: sssMay, phicReport: phicMay, hdmfReport: hdmfMay } =
    buildInputs(maySheets, mayEmps, 2026, 5);
  ok("SSS May employeeCount = 0", sssMay.employeeCount === 0);
  ok("PHIC May employeeCount = 0", phicMay.employeeCount === 0);
  ok("HDMF May employeeCount = 0", hdmfMay.employeeCount === 0);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n--- E4 smoke: ${total - failures}/${total} passed ---\n`);
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
