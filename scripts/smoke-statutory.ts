/**
 * smoke-statutory.ts — verifies resolver + compute against known 2026 values.
 *
 * Run AFTER load-statutory-2026.ts:
 *   npx tsx scripts/load-statutory-2026.ts && npx tsx scripts/smoke-statutory.ts
 *
 * Assertions are deliberately loud (process.exit(1) on first failure) so CI
 * can wire this in later.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getActiveRule } from "../src/lib/statutory/resolver";
import {
  computePagibig,
  computePhilHealth,
  computeSSS,
  getMinimumWage,
  lookupBIR,
} from "../src/lib/statutory/compute";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_ID = process.env.SMOKE_TENANT_ID ?? "cmpnn0rrj0000yi73i6fcm5ih";

let failures = 0;

function check(label: string, actual: bigint | number | string, expected: bigint | number | string) {
  const a = typeof actual === "bigint" ? actual.toString() : String(actual);
  const e = typeof expected === "bigint" ? expected.toString() : String(expected);
  if (a === e) {
    console.log(`  ✓ ${label}: ${a}`);
  } else {
    console.log(`  ✗ ${label}: got ${a}, expected ${e}`);
    failures += 1;
  }
}

async function main() {
  const asOf = new Date("2026-06-15T00:00:00.000Z");

  // -----------------------------------------------------------------------
  // SSS — comp ₱25,000 → MSC ₱25,000 (in-range, stepped).
  //   regular base = mpfThreshold = ₱20,000 → EE 5% = ₱1,000, ER 10% = ₱2,000
  //   mpf base = ₱5,000 → EE 5% = ₱250, ER 10% = ₱500
  //   EC: MSC 25,000 > 14,750 → ₱30
  // -----------------------------------------------------------------------
  console.log("\nSSS @ ₱25,000 monthly:");
  const sssRule = await getActiveRule(prisma, TENANT_ID, "SSS_SCHEDULE", asOf);
  const sss = computeSSS(sssRule.payload, 2_500_000n);
  check("MSC", sss.msc, 2_500_000n);
  check("EE total", sss.employee, 125_000n); // ₱1,250
  check("ER total", sss.employer, 250_000n); // ₱2,500
  check("EC", sss.ec, 3_000n); // ₱30

  // SSS at ceiling: comp ₱40,000 → MSC ₱35,000
  //   regular base ₱20,000 → EE ₱1,000 / ER ₱2,000
  //   mpf base ₱15,000 → EE ₱750 / ER ₱1,500
  console.log("\nSSS @ ₱40,000 monthly (above ceiling):");
  const sssCeil = computeSSS(sssRule.payload, 4_000_000n);
  check("MSC", sssCeil.msc, 3_500_000n);
  check("EE total", sssCeil.employee, 175_000n); // ₱1,750
  check("ER total", sssCeil.employer, 350_000n); // ₱3,500
  check("EC", sssCeil.ec, 3_000n);

  // -----------------------------------------------------------------------
  // PhilHealth — comp ₱30,000 @ 5% = ₱1,500 → split 750 / 750
  // -----------------------------------------------------------------------
  console.log("\nPhilHealth @ ₱30,000:");
  const phicRule = await getActiveRule(prisma, TENANT_ID, "PHILHEALTH_SCHEDULE", asOf);
  const phic = computePhilHealth(phicRule.payload, 3_000_000n);
  check("premium", phic.premium, 150_000n); // ₱1,500
  check("EE", phic.employee, 75_000n);
  check("ER", phic.employer, 75_000n);

  // PhilHealth below floor: ₱8,000 → MSC clamped to ₱10,000 → premium ₱500
  console.log("\nPhilHealth @ ₱8,000 (below floor):");
  const phicLow = computePhilHealth(phicRule.payload, 800_000n);
  check("premium", phicLow.premium, 50_000n);

  // PhilHealth at cap: ₱120,000 → MSC ₱100,000 → premium ₱5,000
  console.log("\nPhilHealth @ ₱120,000 (above ceiling):");
  const phicHi = computePhilHealth(phicRule.payload, 12_000_000n);
  check("premium", phicHi.premium, 500_000n);

  // -----------------------------------------------------------------------
  // Pag-IBIG @ ₱5,000: bracket 2 (EE 2%, ER 2%); MFS capped at ₱10,000 but
  // ₱5,000 < cap so MFS = ₱5,000. EE = ER = ₱100.
  // -----------------------------------------------------------------------
  console.log("\nPag-IBIG @ ₱5,000:");
  const pagRule = await getActiveRule(prisma, TENANT_ID, "PAGIBIG_SCHEDULE", asOf);
  const pag = computePagibig(pagRule.payload, 500_000n);
  check("MFS", pag.mfs, 500_000n);
  check("EE", pag.employee, 10_000n);
  check("ER", pag.employer, 10_000n);

  // Pag-IBIG @ ₱1,200 (low tier): EE 1% / ER 2%
  console.log("\nPag-IBIG @ ₱1,200 (low tier):");
  const pagLow = computePagibig(pagRule.payload, 120_000n);
  check("EE", pagLow.employee, 1_200n); // ₱12
  check("ER", pagLow.employer, 2_400n); // ₱24

  // Pag-IBIG @ ₱15,000 (above cap): MFS = ₱10,000, EE/ER = ₱200 each
  console.log("\nPag-IBIG @ ₱15,000 (above MFS cap):");
  const pagCap = computePagibig(pagRule.payload, 1_500_000n);
  check("MFS", pagCap.mfs, 1_000_000n);
  check("EE", pagCap.employee, 20_000n);
  check("ER", pagCap.employer, 20_000n);

  // -----------------------------------------------------------------------
  // BIR — semi-monthly ₱20,000 → bracket [16,667 – 33,333): 937.50 + 20%(20000-16667) = 937.50 + 666.60 = 1604.10
  // Using table fixedTax = 93,750 centavos, floor = 1,666,700, excess = 333,300 → variable = 66,660 → tax = 160,410
  // -----------------------------------------------------------------------
  console.log("\nBIR semi-monthly @ ₱20,000:");
  const birRule = await getActiveRule(prisma, TENANT_ID, "BIR_WITHHOLDING_TABLE", asOf);
  const birSemi = lookupBIR(birRule.payload, "SEMI_MONTHLY", 2_000_000n);
  check("tax", birSemi.tax, 160_410n);

  // BIR monthly ₱50,000 → bracket [33,333 – 66,667): 1,875 + 20%(50000-33333) = 1,875 + 3,333.40 = 5,208.40
  // floor 3,333,300, fixed 187,500, excess 1,666,700 → variable 333,340 → tax 520,840
  console.log("\nBIR monthly @ ₱50,000:");
  const birMonthly = lookupBIR(birRule.payload, "MONTHLY", 5_000_000n);
  check("tax", birMonthly.tax, 520_840n);

  // BIR monthly ₱20,000 → below first bracket floor → tax 0
  console.log("\nBIR monthly @ ₱20,000 (exempt):");
  const birLow = lookupBIR(birRule.payload, "MONTHLY", 2_000_000n);
  check("tax", birLow.tax, 0n);

  // -----------------------------------------------------------------------
  // Minimum wage lookups
  // -----------------------------------------------------------------------
  console.log("\nMinimum wage:");
  const mwRule = await getActiveRule(prisma, TENANT_ID, "MINIMUM_WAGE_RATE", asOf);
  check("NCR daily", getMinimumWage(mwRule.payload, "NCR"), 64_500n);
  check("IV-A daily", getMinimumWage(mwRule.payload, "REGION_IV_A"), 56_000n);

  // -----------------------------------------------------------------------
  // Resolver boundary tests
  // -----------------------------------------------------------------------
  console.log("\nResolver boundaries:");
  // PHIC effectiveFrom 2025-01-01 — query at 2024-12-31 must throw
  try {
    await getActiveRule(prisma, TENANT_ID, "PHILHEALTH_SCHEDULE", new Date("2024-12-31"));
    console.log("  ✗ pre-effective lookup should have thrown");
    failures += 1;
  } catch (e) {
    console.log(`  ✓ pre-effective lookup threw: ${(e as Error).name}`);
  }
  // SSS at exactly effectiveFrom resolves
  const sssAtBoundary = await getActiveRule(
    prisma,
    TENANT_ID,
    "SSS_SCHEDULE",
    new Date("2026-01-01T00:00:00.000Z"),
  );
  check("SSS @ effectiveFrom", sssAtBoundary.version, "SSS-2026-v1");

  console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
