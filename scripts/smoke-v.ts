/**
 * smoke-v.ts — Phase V: AI Assistant Add-On smoke tests
 *
 * Tests the DB-layer logic and gateway behaviour:
 *   - Feature-flag gating (ai_enabled featureFlag)
 *   - Daily cap enforcement
 *   - callAI stub path (no ANTHROPIC_API_KEY) writes AiUsage rows
 *   - All 5 touchpoints write correct rows
 *   - Usage metering aggregate is correct
 *   - Gateway uses prismaAdmin (BYPASSRLS) for AiUsage writes
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-v.ts
 *
 * NOTE: With an empty ANTHROPIC_API_KEY (dev default), all callAI invocations
 * return stubbed: true, text: "". This is the expected dev-mode behaviour.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  callAI,
  checkAiGating,
  type AiCallInput,
} from "../src/lib/ai/gateway";

// ---------------------------------------------------------------------------
// DB setup (DIRECT_DATABASE_URL = BYPASSRLS)
// ---------------------------------------------------------------------------
const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
const pool      = new Pool({ connectionString: directUrl });
const adapter   = new PrismaPg(pool);
const db        = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let failures = 0;
let total    = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(`  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_A) throw new Error("SMOKE_TENANT_ID env var is not set");

  console.log("Phase V — AI Assistant Add-On\n");

  // Clean up any leftover smoke AI rows from previous runs
  await db.aiUsage.deleteMany({
    where: { tenantId: TENANT_A, refKey: { startsWith: "smoke-v-" } },
  });

  // ── V1: Gating — ai_enabled = false → denied ──────────────────────────────
  console.log("V1 – Feature flag off → checkAiGating returns feature_disabled");
  // Ensure flag is OFF
  const existing = await db.tenant.findUnique({ where: { id: TENANT_A }, select: { featureFlags: true } });
  const existingFlags = (existing?.featureFlags ?? {}) as Record<string, boolean>;
  await db.tenant.update({
    where: { id: TENANT_A },
    data:  { featureFlags: { ...existingFlags, ai_enabled: false } },
  });
  const gating1 = await checkAiGating(TENANT_A);
  check("V1 allowed = false",              gating1.allowed === false);
  check("V1 reason = feature_disabled",    !gating1.allowed && gating1.reason === "feature_disabled");

  // ── V2: Gating — ai_enabled = true → allowed ──────────────────────────────
  console.log("\nV2 – Feature flag on → checkAiGating returns allowed");
  await db.tenant.update({
    where: { id: TENANT_A },
    data:  { featureFlags: { ...existingFlags, ai_enabled: true } },
  });
  const gating2 = await checkAiGating(TENANT_A);
  check("V2 allowed = true", gating2.allowed === true);

  // ── V3: callAI stub (no API key) writes AiUsage row ───────────────────────
  console.log("\nV3 – callAI stub writes AiUsage (no API key)");
  const beforeCount = await db.aiUsage.count({ where: { tenantId: TENANT_A } });
  const callInput: AiCallInput = {
    tenantId:   TENANT_A,
    touchpoint: "HR_CHAT",
    messages:   [{ role: "user", content: "Hello, HR assistant." }],
    model:      "claude-haiku-4-5",
    refKey:     "smoke-v-hr-chat",
  };
  const result = await callAI(callInput);
  // give fire-and-forget a tick to settle
  await new Promise((r) => setTimeout(r, 200));
  const afterCount = await db.aiUsage.count({ where: { tenantId: TENANT_A } });

  check("V3 stubbed = true",           result.stubbed === true);
  check("V3 text = empty string",      result.text === "");
  check("V3 AiUsage row created",      afterCount === beforeCount + 1, `${beforeCount} → ${afterCount}`);
  check("V3 inputTokens = 0",          result.inputTokens === 0);
  check("V3 costMicroUsd = 0n",        result.costMicroUsd === 0n);

  // ── V4: All 6 touchpoints can be called ───────────────────────────────────
  console.log("\nV4 – All 6 touchpoints write AiUsage rows");
  const touchpoints = [
    "HR_CHAT",
    "PAYSLIP_QA",
    "COMPLIANCE_HELPER",
    "ANOMALY_FLAGGING",
    "RESUME_PARSE",
    "DOC_EXTRACTION",
  ] as const;
  for (const tp of touchpoints) {
    await callAI({
      tenantId:   TENANT_A,
      touchpoint: tp,
      messages:   [{ role: "user", content: "test" }],
      model:      "claude-haiku-4-5",
      refKey:     `smoke-v-${tp.toLowerCase()}`,
    });
  }
  await new Promise((r) => setTimeout(r, 300));
  const tpRows = await db.aiUsage.findMany({
    where:  { tenantId: TENANT_A, refKey: { startsWith: "smoke-v-" } },
    select: { touchpoint: true, refKey: true },
  });
  const foundTouchpoints = new Set(tpRows.map((r) => r.touchpoint));
  for (const tp of touchpoints) {
    check(`V4 ${tp} row exists`, foundTouchpoints.has(tp));
  }

  // ── V5: Model selection — Sonnet used when specified ──────────────────────
  console.log("\nV5 – Model field recorded correctly");
  const sonnetResult = await callAI({
    tenantId:   TENANT_A,
    touchpoint: "COMPLIANCE_HELPER",
    messages:   [{ role: "user", content: "BIR Form 2316 deadline?" }],
    model:      "claude-sonnet-4-5",
    refKey:     "smoke-v-sonnet-test",
  });
  await new Promise((r) => setTimeout(r, 200));
  const sonnetRow = await db.aiUsage.findFirst({
    where:  { tenantId: TENANT_A, refKey: "smoke-v-sonnet-test" },
    select: { model: true },
  });
  check("V5 sonnet model = claude-sonnet-4-5", sonnetRow?.model === "claude-sonnet-4-5");
  check("V5 result.model = claude-sonnet-4-5", sonnetResult.model === "claude-sonnet-4-5");

  // ── V6: Daily cap enforcement ──────────────────────────────────────────────
  console.log("\nV6 – Daily cap: inject a large cost row → cap exceeded");
  const hugeCost = 999_999_999n; // >> default $5/day cap
  await db.aiUsage.create({
    data: {
      tenantId:     TENANT_A,
      touchpoint:   "HR_CHAT",
      model:        "claude-haiku-4-5",
      inputTokens:  0,
      outputTokens: 0,
      costMicroUsd: hugeCost,
      refKey:       "smoke-v-cap-test",
    },
  });
  const gatingCap = await checkAiGating(TENANT_A);
  check("V6 allowed = false (cap exceeded)",   gatingCap.allowed === false);
  check("V6 reason = daily_cap_exceeded",      !gatingCap.allowed && gatingCap.reason === "daily_cap_exceeded");
  // Remove the artificial row so further checks aren't affected
  await db.aiUsage.deleteMany({ where: { tenantId: TENANT_A, refKey: "smoke-v-cap-test" } });

  // ── V7: Metering aggregate ────────────────────────────────────────────────
  console.log("\nV7 – AiUsage aggregate: count rows written this run");
  const smokeRows = await db.aiUsage.findMany({
    where:  { tenantId: TENANT_A, refKey: { startsWith: "smoke-v-" } },
    select: { id: true, touchpoint: true, costMicroUsd: true },
  });
  // We wrote: 1 (V3) + 6 (V4) + 1 (V5) = 8 rows
  check("V7 smoke row count = 8", smokeRows.length === 8, smokeRows.length);
  const totalCost = smokeRows.reduce((acc, r) => acc + (r.costMicroUsd as bigint), 0n);
  check("V7 total cost = 0 (all stubbed)", totalCost === 0n, String(totalCost));

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  const deleted = await db.aiUsage.deleteMany({
    where: { tenantId: TENANT_A, refKey: { startsWith: "smoke-v-" } },
  });
  console.log(`  deleted ${deleted.count} AiUsage rows`);
  // Restore featureFlags to original state
  await db.tenant.update({
    where: { id: TENANT_A },
    data:  { featureFlags: existingFlags },
  });
  console.log("  featureFlags restored");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  if (failures === 0) {
    console.log(`Phase V smoke: ${total}/${total} PASS`);
  } else {
    console.error(`Phase V smoke: ${total - failures}/${total} PASS — ${failures} FAIL`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
