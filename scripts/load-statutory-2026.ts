/**
 * load-statutory-2026.ts — idempotent loader for 2026 statutory baseline.
 *
 * Run with:
 *   npx tsx scripts/load-statutory-2026.ts
 *
 * Uses the schema-owner connection (DIRECT_DATABASE_URL → payroll_user, which
 * is BYPASSRLS) so it can write rows with `tenantId = NULL` (global baseline).
 * The app role (payroll_app) cannot do this — see RLS policy in migration
 * 20260527090000_d1_statutory_rules.
 *
 * Idempotency:
 *   Upserts keyed on the unique index `(tenantId, category, version)`. Re-runs
 *   refresh `payload` / `legalBasis` / `effectiveFrom` / `effectiveTo` without
 *   creating duplicates.
 *
 * Legal basis citations are sourced from Sentire_Payroll_Master_Blueprint.md §3.2.
 */
import { PrismaClient, StatutoryCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  parseStatutoryPayload,
} from "../src/lib/statutory/types";
import { adminDatabaseUrl } from "../src/lib/db-urls";
import {
  SSS_2026_FROM,
  PHIC_2025_FROM,
  PAGIBIG_2024_FROM,
  TRAIN_2023_FROM,
  RR29_2025_FROM,
  MIN_WAGE_2025_FROM,
  SSS_2026,
  PHIC_2025,
  PAGIBIG_2024,
  TRAIN_2023,
  DE_MINIMIS_2025,
  MIN_WAGE_2025,
} from "../src/lib/statutory/baseline-2026";

// ---------------------------------------------------------------------------
// Connection (admin / BYPASSRLS — DIRECT_DATABASE_URL).
// ---------------------------------------------------------------------------
// PAY-54 (unit 0.7 follow-up): operator scripts connect ONLY as the owner role via
// DIRECT_DATABASE_URL. They used to fall back to DATABASE_URL, which after the
// runtime switch is payroll_app under RLS: a script would then read nothing and
// report an empty database instead of failing. adminDatabaseUrl() throws instead.
const url = adminDatabaseUrl();
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// PAY-65: the payloads live in src/lib/statutory/baseline-2026.ts, the one
// place they are written down. This script only loads them.

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------
interface RuleSpec {
  category: StatutoryCategory;
  version: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  legalBasis: string;
  payload: unknown;
}

// Postgres unique indexes with NULLable columns: under MVCC semantics two NULLs
// don't collide, so the compound unique `(tenantId, category, version)` with
// `tenantId = NULL` cannot enforce uniqueness for global rows. We therefore
// hand-roll the upsert: lookup by (NULL, category, version) and create-or-update
// by primary key.
/**
 * Order-independent deep comparison of two statutory payloads (unit 1.2).
 *
 * Prisma returns `Json` columns with keys in storage order, which need not match
 * the literal order in this file, so a naive JSON.stringify comparison would
 * report a difference where none exists and block a legitimate re-run.
 */
function payloadsEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Suggest the next version tag, purely for the error message. */
function nextVersionHint(version: string): string {
  const m = version.match(/^(.*?)(\d+)$/);
  if (!m) return `${version}-v2`;
  return `${m[1]}${Number(m[2]) + 1}`;
}

async function upsertGlobalSafe(spec: RuleSpec) {
  parseStatutoryPayload(spec.category, spec.payload);

  const existing = await prisma.statutoryRule.findFirst({
    where: {
      tenantId: null,
      category: spec.category,
      version: spec.version,
    },
    select: { id: true, payload: true },
  });

  if (existing) {
    // Unit 1.2: a PUBLISHED payload is immutable. The editor's PATCH already
    // enforces this — its zod schema admits only `effectiveTo` and `legalBasis`,
    // never `payload` — and this script must not be the back door around it.
    // Rewriting the math of a version that has already priced payslips
    // retroactively falsifies documents that were correct when issued, and does
    // so silently, because nothing records which version produced a sheet.
    if (!payloadsEqual(existing.payload, spec.payload)) {
      throw new Error(
        `REFUSING to rewrite a published statutory payload.\n` +
          `  category: ${spec.category}\n` +
          `  version : ${spec.version}\n` +
          `The row already in the database has a DIFFERENT payload from this file.\n` +
          `Statutory versions are immutable once published: a payroll period may\n` +
          `already have been computed against the stored values, and changing them\n` +
          `would silently restate figures that were correct when issued.\n` +
          `\n` +
          `To change the math, publish a NEW version instead:\n` +
          `  1. give the new rule a distinct \`version\` (e.g. "${spec.version}" -> "${nextVersionHint(spec.version)}")\n` +
          `  2. set the OLD rule's \`effectiveTo\` to the new rule's \`effectiveFrom\`\n` +
          `  3. re-run this script\n`,
      );
    }

    await prisma.statutoryRule.update({
      where: { id: existing.id },
      data: {
        effectiveFrom: spec.effectiveFrom,
        effectiveTo: spec.effectiveTo ?? null,
        legalBasis: spec.legalBasis,
        // `payload` is deliberately NOT updated — see the guard above. Dates and
        // the citation stay refreshable because they describe the rule's
        // applicability and provenance, not the money it computes.
      },
    });
    console.log(
      `  update ${spec.category.padEnd(22)} ${spec.version.padEnd(28)} → ${existing.id}`,
    );
  } else {
    const created = await prisma.statutoryRule.create({
      data: {
        tenantId: null,
        category: spec.category,
        version: spec.version,
        effectiveFrom: spec.effectiveFrom,
        effectiveTo: spec.effectiveTo ?? null,
        legalBasis: spec.legalBasis,
        payload: spec.payload as never,
      },
    });
    console.log(
      `  create ${spec.category.padEnd(22)} ${spec.version.padEnd(28)} → ${created.id}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Loading 2026 statutory baseline (global rules)...");

  const specs: RuleSpec[] = [
    {
      category: "SSS_SCHEDULE",
      version: "SSS-2026-v1",
      effectiveFrom: SSS_2026_FROM,
      legalBasis: "RA 11199 (SSS Act of 2018) + SSS Circular 2025-006",
      payload: SSS_2026,
    },
    {
      category: "PHILHEALTH_SCHEDULE",
      version: "PHIC-2025-v1",
      effectiveFrom: PHIC_2025_FROM,
      legalBasis: "RA 11223 (UHC Act) + PhilHealth Circular 2025-001",
      payload: PHIC_2025,
    },
    {
      category: "PAGIBIG_SCHEDULE",
      version: "HDMF-2024-v1",
      effectiveFrom: PAGIBIG_2024_FROM,
      legalBasis: "RA 9679 (HDMF Law) + HDMF Circular No. 460",
      payload: PAGIBIG_2024,
    },
    {
      category: "BIR_WITHHOLDING_TABLE",
      version: "TRAIN-2023-onward-v1",
      effectiveFrom: TRAIN_2023_FROM,
      legalBasis: "RA 10963 (TRAIN) §24(A)(2)(b), revised withholding tables",
      payload: TRAIN_2023,
    },
    {
      category: "DE_MINIMIS_CEILING",
      version: "RR-29-2025-v1",
      effectiveFrom: RR29_2025_FROM,
      legalBasis: "BIR Revenue Regulations No. 29-2025",
      payload: DE_MINIMIS_2025,
    },
    {
      category: "MINIMUM_WAGE_RATE",
      version: "RTWPB-2025-v1",
      effectiveFrom: MIN_WAGE_2025_FROM,
      legalBasis:
        "RTWPB Wage Order NCR-26 (NCR) + Wage Order IVA-22 (Region IV-A)",
      payload: MIN_WAGE_2025,
    },
  ];

  for (const spec of specs) {
    await upsertGlobalSafe(spec);
  }

  console.log(`\nLoaded ${specs.length} global statutory rules.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
