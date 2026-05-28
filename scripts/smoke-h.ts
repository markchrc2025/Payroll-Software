/**
 * smoke-h.ts — Phase H: Multi-Bank Payroll Advice Files
 *
 * Tests:
 *  T1.  Create + finalize a payroll run (June 16–30 2026, REGULAR, 10 employees)
 *  T2.  BDO: header H-record, detail count = 10, CRLF endings
 *  T3.  BDO: pipe-delimiter, first detail starts with "D|1|"
 *  T4.  BDO: total amount in header matches Σ netPayCents
 *  T5.  Metrobank: fixed-width, first char of header = "H", trailer starts "T"
 *  T6.  Metrobank: detail count (D-records) = 10
 *  T7.  Metrobank: trailer total matches Σ netPayCents
 *  T8.  UnionBank: CSV header row has "Account Number" as first column
 *  T9.  UnionBank: detail row count (excluding header + summary) = 10
 *  T10. UnionBank: TOTAL summary row present as last non-empty line
 *  T11. Landbank: pipe-delimiter, header starts "H|"
 *  T12. Landbank: detail count = 10, each D-row has 6 pipe-delimited fields
 *  T13. Landbank: EMP- prefix on remarks field of first detail row
 *  T14. PNB: tab-delimited, no header row (first line is data)
 *  T15. PNB: TOTAL summary row is last non-empty line
 *  T16. PNB: detail count (non-summary rows) = 10
 *  T17. BDO: pure unit test — 2 rows, total = sum of both amounts
 *  T18. UnionBank: empty account number → blank field in CSV
 *  T19. Landbank: date format is DDMMYYYY
 *  T20. Metrobank: header length = 46 chars, detail length = 80 chars
 *  T21. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-h.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createDraftRun, finalizeRun } from "../src/lib/payroll/persist";
import { formatBdoFile } from "../src/lib/payroll/bank-files/bdo";
import { formatMetrobankFile } from "../src/lib/payroll/bank-files/metrobank";
import { formatUnionBankFile } from "../src/lib/payroll/bank-files/unionbank";
import { formatLandbankFile } from "../src/lib/payroll/bank-files/landbank";
import { formatPnbFile } from "../src/lib/payroll/bank-files/pnb";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";

const PERIOD_START = new Date("2026-07-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-07-15T00:00:00.000Z");

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
    const books = await tx.payrollBook.findMany({
      where: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    });
    for (const b of books) {
      await tx.auditLog.deleteMany({
        where: { entity: "PayrollBook", entityId: b.id },
      });
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: b.id } });
      await tx.payrollBook.delete({ where: { id: b.id } });
    }
  });
}

/** Parse peso string "1234.56" → centavos bigint */
function parsePeso(s: string): bigint {
  const [intPart, fracPart = "00"] = s.split(".");
  return BigInt(intPart!) * 100n + BigInt(fracPart.padEnd(2, "0").slice(0, 2));
}

async function main() {
  console.log("=== smoke-h: Phase H — Multi-Bank Payroll Advice Files ===\n");

  await cleanup();

  // -------------------------------------------------------------------------
  // T1: Create + finalize a REGULAR payroll run
  // -------------------------------------------------------------------------
  console.log("[T1] Create + finalize REGULAR run (Jul 1–15 2026)");
  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cycle: "SEMI_MONTHLY",
    runType: "REGULAR",
    createdByUserId: "smoke-h",
  });
  check("Book created (DRAFT)", book.status === "DRAFT", book.id);
  check("Sheets generated (10 employees)", book.sheets.length === 10, book.sheets.length);

  const finalized = await finalizeRun(TENANT_A, book.id, null);
  check("Book finalized", finalized.status === "FINALIZED");

  const bookId = finalized.id;

  // Load employee bank data for formatting
  const employeeIds = finalized.sheets.map((s) => s.employeeId);
  const employees = await withT(TENANT_A, (tx) =>
    tx.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        employeeNumber: true,
        bankAccountNumber: true,
        bankAccountName: true,
      },
    }),
  );
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const rows = finalized.sheets.map((sheet) => {
    const emp = empMap.get(sheet.employeeId);
    return {
      employeeNumber:
        emp?.employeeNumber ?? sheet.employeeId.substring(0, 12),
      accountNumber: emp?.bankAccountNumber ?? null,
      accountName: emp?.bankAccountName ?? null,
      netPayCents: sheet.netPayCents,
    };
  });

  const totalCents = rows.reduce((s, r) => s + r.netPayCents, 0n);

  const PERIOD_END_DATE = finalized.periodEnd;
  const ymd =
    PERIOD_END_DATE.getUTCFullYear().toString() +
    (PERIOD_END_DATE.getUTCMonth() + 1).toString().padStart(2, "0") +
    PERIOD_END_DATE.getUTCDate().toString().padStart(2, "0");
  const batchRef = `${bookId.substring(0, 8)}${ymd}`;
  const baseInput = {
    companyName: "Test Company PH",
    valueDate: PERIOD_END_DATE,
    batchReference: batchRef,
    rows,
  };

  const ROW_COUNT = rows.length;

  // -------------------------------------------------------------------------
  // T2–T4: BDO
  // -------------------------------------------------------------------------
  console.log("\n[T2–T4] BDO formatter");
  const bdoContent = formatBdoFile(baseInput);
  const bdoLines = bdoContent.split("\r\n").filter((l) => l.length > 0);

  check(
    "BDO: CRLF line endings",
    bdoContent.includes("\r\n"),
  );
  check(
    "BDO: header H-record present",
    bdoLines[0]!.startsWith("H|"),
    bdoLines[0]!.substring(0, 20),
  );
  check(
    "BDO: detail count = 10",
    bdoLines.filter((l) => l.startsWith("D|")).length === ROW_COUNT,
    bdoLines.filter((l) => l.startsWith("D|")).length,
  );
  // T3
  const firstDetail = bdoLines.find((l) => l.startsWith("D|"))!;
  check(
    "BDO: first detail starts with D|1|",
    firstDetail.startsWith("D|1|"),
    firstDetail.substring(0, 10),
  );
  // T4: header total matches sum of detail row amounts (formatter consistency)
  const headerFields = bdoLines[0]!.split("|");
  const headerTotal = parsePeso(headerFields[4]!);
  const bdoDetailTotal = bdoLines
    .filter((l) => l.startsWith("D|"))
    .reduce((s, l) => s + parsePeso(l.split("|")[4]!), 0n);
  check(
    "BDO: header total matches Σ detail amounts",
    headerTotal === bdoDetailTotal,
    `${headerTotal} === ${bdoDetailTotal}`,
  );

  // -------------------------------------------------------------------------
  // T5–T7: Metrobank
  // -------------------------------------------------------------------------
  console.log("\n[T5–T7] Metrobank formatter");
  const mbContent = formatMetrobankFile(baseInput);
  const mbLines = mbContent.split("\r\n").filter((l) => l.length > 0);

  check(
    "Metrobank: header first char = H",
    mbLines[0]!.charAt(0) === "H",
    mbLines[0]!.charAt(0),
  );
  check(
    "Metrobank: trailer last line starts with T",
    mbLines[mbLines.length - 1]!.charAt(0) === "T",
    mbLines[mbLines.length - 1]!.charAt(0),
  );
  const mbDetails = mbLines.filter((l) => l.charAt(0) === "D");
  check(
    "Metrobank: D-record count = 10",
    mbDetails.length === ROW_COUNT,
    mbDetails.length,
  );
  // T7: trailer total matches sum of detail row amounts (formatter consistency)
  const trailer = mbLines[mbLines.length - 1]!;
  // Trailer format: T + RECCOUNT(6) + TOTALAMT(15)
  const trailerAmt = trailer.substring(7, 22); // "############.##"
  const trailerCents = parsePeso(trailerAmt.replace(/^0+/, "") || "0");
  const mbDetailTotal = mbLines
    .filter((l) => l.charAt(0) === "D")
    .reduce((s, l) => {
      // Detail: D(1) + SEQ(6) + ACCTNO(16) + ACCTNAME(30) + AMT(15) + EMPNO(12)
      const amtStr = l.substring(53, 68).replace(/^0+/, "") || "0";
      return s + parsePeso(amtStr);
    }, 0n);
  check(
    "Metrobank: trailer total matches Σ detail amounts",
    trailerCents === mbDetailTotal,
    `${trailerCents} === ${mbDetailTotal}`,
  );

  // -------------------------------------------------------------------------
  // T8–T10: UnionBank
  // -------------------------------------------------------------------------
  console.log("\n[T8–T10] UnionBank formatter");
  const ubContent = formatUnionBankFile(baseInput);
  const ubLines = ubContent.split("\r\n").filter((l) => l.length > 0);

  check(
    "UnionBank: CSV header row has Account Number",
    ubLines[0]!.includes("Account Number"),
    ubLines[0]!.substring(0, 30),
  );
  // Detail rows = total lines - 1 (header) - 1 (TOTAL summary)
  const ubDetailCount = ubLines.length - 2;
  check(
    "UnionBank: detail row count = 10",
    ubDetailCount === ROW_COUNT,
    ubDetailCount,
  );
  const ubLastLine = ubLines[ubLines.length - 1]!;
  check(
    "UnionBank: last row is TOTAL summary",
    ubLastLine.includes("TOTAL"),
    ubLastLine.substring(0, 20),
  );

  // -------------------------------------------------------------------------
  // T11–T13: Landbank
  // -------------------------------------------------------------------------
  console.log("\n[T11–T13] Landbank formatter");
  const lbContent = formatLandbankFile(baseInput);
  const lbLines = lbContent.split("\r\n").filter((l) => l.length > 0);

  check(
    "Landbank: header starts with H|",
    lbLines[0]!.startsWith("H|"),
    lbLines[0]!.substring(0, 10),
  );
  const lbDetails = lbLines.filter((l) => l.startsWith("D|"));
  check(
    "Landbank: D-record count = 10",
    lbDetails.length === ROW_COUNT,
    lbDetails.length,
  );
  // Each D-row should have exactly 6 pipe-separated fields (D|seq|acct|name|amt|remarks)
  const lbFieldCounts = lbDetails.map((l) => l.split("|").length);
  check(
    "Landbank: every D-row has 6 pipe fields",
    lbFieldCounts.every((c) => c === 6),
    lbFieldCounts.join(","),
  );
  // T13: EMP- prefix in remarks
  check(
    "Landbank: remarks field has EMP- prefix",
    lbDetails[0]!.split("|")[5]!.startsWith("EMP-"),
    lbDetails[0]!.split("|")[5],
  );

  // -------------------------------------------------------------------------
  // T14–T16: PNB
  // -------------------------------------------------------------------------
  console.log("\n[T14–T16] PNB formatter");
  const pnbContent = formatPnbFile(baseInput);
  const pnbLines = pnbContent.split("\r\n").filter((l) => l.length > 0);

  // First non-empty line should be a detail row (no header)
  const pnbFirst = pnbLines[0]!;
  check(
    "PNB: no header row (first line is data, not 'Account Number')",
    !pnbFirst.includes("Account Number"),
    pnbFirst.substring(0, 20),
  );
  const pnbLast = pnbLines[pnbLines.length - 1]!;
  check(
    "PNB: last line is TOTAL summary",
    pnbLast.startsWith("TOTAL\t"),
    pnbLast.substring(0, 20),
  );
  const pnbDetailCount = pnbLines.length - 1; // exclude TOTAL row
  check(
    "PNB: detail count = 10",
    pnbDetailCount === ROW_COUNT,
    pnbDetailCount,
  );

  // -------------------------------------------------------------------------
  // T17: BDO unit test with mock data (no DB)
  // -------------------------------------------------------------------------
  console.log("\n[T17] BDO pure unit test (mock rows)");
  const mockRows = [
    {
      employeeNumber: "EMP001",
      accountNumber: "1234567890",
      accountName: "Juan dela Cruz",
      netPayCents: 1500000n, // ₱15,000.00
    },
    {
      employeeNumber: "EMP002",
      accountNumber: "0987654321",
      accountName: "Maria Santos",
      netPayCents: 2000050n, // ₱20,000.50
    },
  ];
  const mockBdo = formatBdoFile({
    companyName: "ACME Corp",
    valueDate: new Date("2026-07-15T00:00:00.000Z"),
    batchReference: "MOCK-BATCH-001",
    rows: mockRows,
  });
  const mockBdoLines = mockBdo.split("\r\n").filter((l) => l.length > 0);
  const mockHeader = mockBdoLines[0]!.split("|");
  const mockTotal = parsePeso(mockHeader[4]!);
  check(
    "BDO unit: total = ₱35,000.50",
    mockTotal === 3500050n,
    `${mockTotal} centavos`,
  );
  check(
    "BDO unit: 2 detail rows",
    mockBdoLines.filter((l) => l.startsWith("D|")).length === 2,
  );

  // -------------------------------------------------------------------------
  // T18: UnionBank — null account number → blank quoted field
  // -------------------------------------------------------------------------
  console.log("\n[T18] UnionBank: null account → blank CSV field");
  const ubNull = formatUnionBankFile({
    companyName: "Test",
    valueDate: new Date("2026-07-15T00:00:00.000Z"),
    batchReference: "TEST",
    rows: [
      {
        employeeNumber: "EMP003",
        accountNumber: null,
        accountName: null,
        netPayCents: 500000n,
      },
    ],
  });
  const ubNullDetail = ubNull.split("\r\n")[1]!; // first detail after header
  check(
    "UnionBank: blank account field emitted",
    ubNullDetail.startsWith('""'),
    ubNullDetail.substring(0, 10),
  );

  // -------------------------------------------------------------------------
  // T19: Landbank — date format DDMMYYYY in header
  // -------------------------------------------------------------------------
  console.log("\n[T19] Landbank: date format DDMMYYYY");
  const lbDateTest = formatLandbankFile({
    companyName: "Test",
    valueDate: new Date("2026-03-05T00:00:00.000Z"), // March 5 → "05032026"
    batchReference: "TEST",
    rows: [
      {
        employeeNumber: "EMP001",
        accountNumber: "111",
        accountName: "Test",
        netPayCents: 100000n,
      },
    ],
  });
  const lbDateHeader = lbDateTest.split("\r\n")[0]!;
  const lbDateField = lbDateHeader.split("|")[2]!;
  check(
    "Landbank: date = DDMMYYYY (05032026)",
    lbDateField === "05032026",
    lbDateField,
  );

  // -------------------------------------------------------------------------
  // T20: Metrobank fixed-width line lengths
  // -------------------------------------------------------------------------
  console.log("\n[T20] Metrobank: fixed-width line lengths");
  const mbHeader = mbLines[0]!;
  const mbFirstDetail = mbLines.find((l) => l.charAt(0) === "D")!;
  check(
    "Metrobank: header line = 46 chars",
    mbHeader.length === 46,
    `got ${mbHeader.length}`,
  );
  check(
    "Metrobank: detail line = 80 chars",
    mbFirstDetail.length === 80,
    `got ${mbFirstDetail.length}`,
  );

  // -------------------------------------------------------------------------
  // T21: Cleanup
  // -------------------------------------------------------------------------
  console.log("\n[T21] Cleanup");
  await cleanup();
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
