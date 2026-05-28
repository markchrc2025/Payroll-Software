/**
 * smoke-u.ts — Phase U: SUPER_ADMIN Portal smoke tests
 *
 * Tests the DB-layer logic exercised by:
 *   GET/POST /api/admin/tenants
 *   PATCH    /api/admin/tenants/[id]
 *   GET      /api/admin/audit-log
 *   GET/POST /api/admin/statutory/sss
 *   PATCH    /api/admin/statutory/sss/[id]
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-u.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// DB setup — use DIRECT_DATABASE_URL (BYPASSRLS) for global statutory rows
// ---------------------------------------------------------------------------
const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: directUrl });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";

// Unique suffix so repeated runs don't clash
const SMOKE_SUFFIX   = `smoke-u-${Date.now()}`;
const SMOKE_SUBDOMAIN = `smoke-sub-${Date.now()}`;
const SMOKE_VERSION   = `v-smoke-${Date.now()}`;

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_A) throw new Error("SMOKE_TENANT_ID env var is not set");

  console.log("Phase U — SUPER_ADMIN Portal\n");

  let smokeTenantId: string | null = null;
  let smokeRuleId: string | null   = null;

  // ── U1: DEV_TENANT exists ─────────────────────────────────────────────────
  console.log("U1 – List tenants → seed tenant present");
  const tenants = await db.tenant.findMany({
    where:   { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select:  { id: true, name: true, subscriptionTier: true, featureFlags: true },
    take:    100,
  });
  check("U1 at least one tenant", tenants.length > 0, tenants.length);
  const devTenant = tenants.find((t) => t.id === TENANT_A);
  check("U1 DEV_TENANT in list",  !!devTenant, TENANT_A);

  // ── U2: GET single tenant details ─────────────────────────────────────────
  console.log("\nU2 – Tenant has subscriptionTier + featureFlags");
  const tenant = await db.tenant.findUnique({
    where:  { id: TENANT_A },
    select: {
      id: true,
      name: true,
      subscriptionTier: true,
      featureFlags: true,
      _count: { select: { employees: true, users: true } },
    },
  });
  check("U2 tenant found",              !!tenant);
  check("U2 subscriptionTier present",  !!tenant?.subscriptionTier, tenant?.subscriptionTier);
  check("U2 featureFlags is object",    tenant?.featureFlags !== null && typeof tenant?.featureFlags === "object");
  check("U2 _count.employees ≥ 0",      (tenant?._count?.employees ?? -1) >= 0);

  // ── U3: PATCH subscriptionTier ────────────────────────────────────────────
  console.log("\nU3 – PATCH subscriptionTier STARTER→GROWTH→restore");
  const before = tenant?.subscriptionTier;
  const target = before === "STARTER" ? "GROWTH" : "STARTER";
  await db.tenant.update({
    where: { id: TENANT_A },
    data:  { subscriptionTier: target },
  });
  const afterPatch = await db.tenant.findUnique({
    where:  { id: TENANT_A },
    select: { subscriptionTier: true },
  });
  check("U3 subscriptionTier updated", afterPatch?.subscriptionTier === target, afterPatch?.subscriptionTier);
  // restore
  await db.tenant.update({ where: { id: TENANT_A }, data: { subscriptionTier: before! } });
  const restored = await db.tenant.findUnique({ where: { id: TENANT_A }, select: { subscriptionTier: true } });
  check("U3 subscriptionTier restored", restored?.subscriptionTier === before, restored?.subscriptionTier);

  // ── U4: Merge featureFlags ────────────────────────────────────────────────
  console.log("\nU4 – Merge featureFlags (patch, not replace)");
  const existingFlags = (tenant?.featureFlags ?? {}) as Record<string, boolean>;
  const mergedFlags   = { ...existingFlags, smokeTest: true, anotherFlag: false };
  await db.tenant.update({
    where: { id: TENANT_A },
    data:  { featureFlags: mergedFlags },
  });
  const afterMerge = await db.tenant.findUnique({
    where:  { id: TENANT_A },
    select: { featureFlags: true },
  });
  const mergedResult = afterMerge?.featureFlags as Record<string, boolean>;
  check("U4 smokeTest flag set",      mergedResult?.smokeTest === true);
  check("U4 anotherFlag set",         mergedResult?.anotherFlag === false);
  // restore
  await db.tenant.update({ where: { id: TENANT_A }, data: { featureFlags: existingFlags } });
  const flagsRestored = await db.tenant.findUnique({ where: { id: TENANT_A }, select: { featureFlags: true } });
  check("U4 featureFlags restored",   JSON.stringify(flagsRestored?.featureFlags) === JSON.stringify(existingFlags));

  // ── U5: Create new tenant ─────────────────────────────────────────────────
  console.log("\nU5 – Create new smoke tenant");
  const newTenant = await db.tenant.create({
    data: {
      name:               `Smoke Co ${SMOKE_SUFFIX}`,
      subdomain:          SMOKE_SUBDOMAIN,
      subscriptionTier:   "STARTER",
      subscriptionStatus: "TRIALING",
      featureFlags:       {},
    },
  });
  smokeTenantId = newTenant.id;
  check("U5 tenant created",    !!newTenant.id, newTenant.id);
  check("U5 subscriptionTier", newTenant.subscriptionTier === "STARTER");
  check("U5 subdomain",         newTenant.subdomain === SMOKE_SUBDOMAIN);

  // ── U6: Duplicate subdomain → unique constraint ───────────────────────────
  console.log("\nU6 – Duplicate subdomain → P2002 conflict");
  let dupError: unknown = null;
  try {
    await db.tenant.create({
      data: {
        name:               `Dup ${SMOKE_SUFFIX}`,
        subdomain:          SMOKE_SUBDOMAIN, // same subdomain
        subscriptionTier:   "STARTER",
        subscriptionStatus: "TRIALING",
        featureFlags:       {},
      },
    });
  } catch (e: unknown) {
    dupError = e;
  }
  check("U6 duplicate subdomain throws", dupError !== null);
  const isP2002 =
    dupError !== null &&
    typeof dupError === "object" &&
    "code" in dupError &&
    (dupError as { code: string }).code === "P2002";
  check("U6 error code P2002", isP2002);

  // ── U7: Create SSS statutory rule ─────────────────────────────────────────
  console.log("\nU7 – Create SSS_SCHEDULE statutory rule");
  const sssPayload = {
    monthlyRate: { ee: 0.045, er: 0.09 },
    msc: { floor: 400000, ceiling: 3000000, step: 50000 },
    mpfThresholdMsc: 2000000,
    ec: { thresholdMsc: 1500000, lowAmount: 1000, highAmount: 3000 },
  };
  const newRule = await db.statutoryRule.create({
    data: {
      tenantId:    null,
      category:    "SSS_SCHEDULE",
      effectiveFrom: new Date("2026-01-01"),
      legalBasis:  `SSS Circular ${SMOKE_SUFFIX}`,
      version:     SMOKE_VERSION,
      payload:     sssPayload,
    },
    select: { id: true, category: true, version: true, tenantId: true },
  });
  smokeRuleId = newRule.id;
  check("U7 rule created",         !!newRule.id, newRule.id);
  check("U7 category SSS_SCHEDULE", newRule.category === "SSS_SCHEDULE");
  check("U7 tenantId is null",      newRule.tenantId === null);

  // ── U8: List statutory rules → includes new rule ──────────────────────────
  console.log("\nU8 – List SSS_SCHEDULE global rules → includes U7 rule");
  const ruleList = await db.statutoryRule.findMany({
    where:   { category: "SSS_SCHEDULE", tenantId: null },
    orderBy: { effectiveFrom: "desc" },
    select:  { id: true, version: true },
  });
  check("U8 list non-empty",         ruleList.length > 0, ruleList.length);
  const foundRule = ruleList.find((r) => r.id === smokeRuleId);
  check("U8 U7 rule in list",        !!foundRule, smokeRuleId);

  // ── U9: PATCH rule effectiveTo ────────────────────────────────────────────
  console.log("\nU9 – PATCH rule effectiveTo");
  const newEffectiveTo = new Date("2026-12-31");
  await db.statutoryRule.update({
    where: { id: smokeRuleId! },
    data:  { effectiveTo: newEffectiveTo },
  });
  const patchedRule = await db.statutoryRule.findUnique({
    where:  { id: smokeRuleId! },
    select: { effectiveTo: true },
  });
  check("U9 effectiveTo set", patchedRule?.effectiveTo?.toISOString().startsWith("2026-12-31") === true);

  // ── U10: Duplicate version → P2002 ────────────────────────────────────────
  console.log("\nU10 – Duplicate version (same category+tenantId+version) → P2002");
  let dupRuleError: unknown = null;
  try {
    await db.statutoryRule.create({
      data: {
        tenantId:     null,
        category:     "SSS_SCHEDULE",
        effectiveFrom: new Date("2026-02-01"),
        legalBasis:   "Duplicate test",
        version:      SMOKE_VERSION, // same version
        payload:      sssPayload,
      },
    });
  } catch (e: unknown) {
    dupRuleError = e;
  }
  check("U10 duplicate version throws", dupRuleError !== null);
  const isRuleP2002 =
    dupRuleError !== null &&
    typeof dupRuleError === "object" &&
    "code" in dupRuleError &&
    (dupRuleError as { code: string }).code === "P2002";
  check("U10 error code P2002", isRuleP2002);

  // ── U11: Write + list audit log ───────────────────────────────────────────
  console.log("\nU11 – Write audit log entry + verify retrieval");
  const auditEntry = await db.auditLog.create({
    data: {
      tenantId:    smokeTenantId!,
      actorUserId: null,
      action:      "CREATE",
      entity:      "Tenant",
      entityId:    smokeTenantId!,
      changes:     { smoke: true },
      ipAddress:   "127.0.0.1",
    },
  });
  check("U11 audit entry created", !!auditEntry.id, auditEntry.id);

  const auditList = await db.auditLog.findMany({
    where:   { tenantId: smokeTenantId! },
    orderBy: { createdAt: "desc" },
    take: 10,
    select:  { id: true, action: true, entity: true },
  });
  check("U11 audit list non-empty", auditList.length > 0);
  const found = auditList.find((a) => a.id === auditEntry.id);
  check("U11 entry in list",        !!found);
  check("U11 action = CREATE",      found?.action === "CREATE");
  check("U11 entity = Tenant",      found?.entity === "Tenant");

  // ── U12: Filter audit log by tenantId ─────────────────────────────────────
  console.log("\nU12 – Audit log filtered by tenantId is scoped");
  const filtered = await db.auditLog.findMany({
    where:  { tenantId: smokeTenantId! },
    select: { tenantId: true },
  });
  check("U12 all entries have smokeTenantId",
    filtered.every((e) => e.tenantId === smokeTenantId),
    filtered.length,
  );
  // Make sure TENANT_A entries don't leak into smokeTenant results
  const tAFiltered = await db.auditLog.findMany({
    where:   { tenantId: TENANT_A },
    orderBy: { createdAt: "desc" },
    take:    5,
    select:  { tenantId: true },
  });
  check("U12 TENANT_A scope no smoke entries",
    tAFiltered.every((e) => e.tenantId === TENANT_A),
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  if (smokeRuleId) {
    await db.statutoryRule.delete({ where: { id: smokeRuleId } });
    console.log(`  deleted StatutoryRule ${smokeRuleId}`);
  }
  if (smokeTenantId) {
    await db.auditLog.deleteMany({ where: { tenantId: smokeTenantId } });
    await db.tenant.delete({ where: { id: smokeTenantId } });
    console.log(`  deleted smoke tenant ${smokeTenantId}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  if (failures === 0) {
    console.log(`Phase U smoke: ${total}/${total} PASS`);
  } else {
    console.error(`Phase U smoke: ${total - failures}/${total} PASS — ${failures} FAIL`);
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
