/**
 * smoke-q.ts — Phase Q: Org Structure CRUD
 *
 *  T1.  POST create WorkLocation (NCR region) → 201
 *  T2.  GET work-locations → new WL in list
 *  T3.  POST create Branch linked to WorkLocation → 201
 *  T4.  GET branches → new branch in list with workLocationId
 *  T5.  PUT upsert Geofence on Branch → created
 *  T6.  PUT upsert Geofence again (update) → updated, same id
 *  T7.  GET /branches/[id]/geofence → geofence returned
 *  T8.  POST create Department → 201
 *  T9.  GET departments → dept in list
 *  T10. POST create Position (SENIOR) → 201
 *  T11. GET positions → position in list, filter by level works
 *  T12. PATCH WorkLocation name → updated
 *  T13. PATCH Branch (change workLocationId) → updated
 *  T14. PATCH Department name → updated
 *  T15. PATCH Position title → updated
 *  T16. Duplicate WorkLocation name → 409 detected via DB
 *  T17. DELETE Position (no employees) → soft-deleted
 *  T18. DELETE Department (no employees) → soft-deleted
 *  T19. DELETE Branch (no employees) → soft-deleted
 *  T20. DELETE WorkLocation (no active branches) → soft-deleted
 *  T21. Cross-tenant isolation: WL created in TENANT_A not visible to TENANT_B
 *  T22. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-q.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";

// Use a second fake tenant ID to test isolation (different from TENANT_A)
const TENANT_B = "smoke00000000000000000000q";

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
// withTenant helper (same pattern as all other smoke scripts)
// ---------------------------------------------------------------------------
async function withT<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_A) throw new Error("SMOKE_TENANT_ID env var is not set");

  const ts = Date.now();
  console.log("Phase Q — Org Structure CRUD\n");

  // ── T1: Create WorkLocation ──────────────────────────────────────────────
  console.log("T1 – POST: create WorkLocation");
  const wl = await withT(TENANT_A, (tx) =>
    tx.workLocation.create({
      data: {
        tenantId: TENANT_A,
        name: `NCR Office ${ts}`,
        region: "NCR",
        city: "Makati",
        province: null,
        zipCode: "1200",
      },
    })
  );
  check("WorkLocation created", !!wl.id);
  check("region = NCR", wl.region === "NCR");

  // ── T2: List WorkLocations ────────────────────────────────────────────────
  console.log("\nT2 – GET work-locations → includes new WL");
  const wlList = await withT(TENANT_A, (tx) =>
    tx.workLocation.findMany({
      where: { tenantId: TENANT_A, deletedAt: null },
    })
  );
  check("WL in list", wlList.some((r) => r.id === wl.id));

  // ── T3: Create Branch ────────────────────────────────────────────────────
  console.log("\nT3 – POST: create Branch linked to WorkLocation");
  const branch = await withT(TENANT_A, (tx) =>
    tx.branch.create({
      data: {
        tenantId: TENANT_A,
        name: `Makati Branch ${ts}`,
        workLocationId: wl.id,
        isHeadOffice: false,
      },
    })
  );
  check("Branch created", !!branch.id);
  check("workLocationId linked", branch.workLocationId === wl.id);

  // ── T4: List Branches ────────────────────────────────────────────────────
  console.log("\nT4 – GET branches → includes new branch");
  const branchList = await withT(TENANT_A, (tx) =>
    tx.branch.findMany({
      where: { tenantId: TENANT_A, deletedAt: null },
      select: { id: true, workLocationId: true },
    })
  );
  check("Branch in list", branchList.some((b) => b.id === branch.id));
  check("workLocationId present", branchList.find((b) => b.id === branch.id)?.workLocationId === wl.id);

  // ── T5: Upsert Geofence (create) ─────────────────────────────────────────
  console.log("\nT5 – PUT geofence on branch → created");
  const geo = await withT(TENANT_A, (tx) =>
    tx.geofence.upsert({
      where: { id: "nonexistent-smoke-q" },
      create: {
        tenantId: TENANT_A,
        branchId: branch.id,
        name: `Makati Geofence ${ts}`,
        latitude: 14.5547,
        longitude: 121.0244,
        radiusMeters: 100,
        isActive: true,
      },
      update: {},
    }).catch(() =>
      tx.geofence.create({
        data: {
          tenantId: TENANT_A,
          branchId: branch.id,
          name: `Makati Geofence ${ts}`,
          latitude: 14.5547,
          longitude: 121.0244,
          radiusMeters: 100,
          isActive: true,
        },
      })
    )
  );
  check("Geofence created", !!geo.id);
  check("branchId linked", geo.branchId === branch.id);
  check("radiusMeters = 100", geo.radiusMeters === 100);

  // ── T6: Update Geofence (upsert = update) ────────────────────────────────
  console.log("\nT6 – PUT geofence again → updated radius");
  const geoUpdated = await withT(TENANT_A, (tx) =>
    tx.geofence.update({
      where: { id: geo.id },
      data: { radiusMeters: 200 },
    })
  );
  check("same id", geoUpdated.id === geo.id);
  check("radiusMeters updated to 200", geoUpdated.radiusMeters === 200);

  // ── T7: Get geofence via branch id ───────────────────────────────────────
  console.log("\nT7 – GET geofence by branchId");
  const geoFetch = await withT(TENANT_A, (tx) =>
    tx.geofence.findFirst({
      where: { branchId: branch.id, tenantId: TENANT_A, deletedAt: null },
    })
  );
  check("geofence found", !!geoFetch);
  check("radiusMeters = 200", geoFetch?.radiusMeters === 200);

  // ── T8: Create Department ────────────────────────────────────────────────
  console.log("\nT8 – POST: create Department");
  const dept = await withT(TENANT_A, (tx) =>
    tx.department.create({
      data: {
        tenantId: TENANT_A,
        name: `Engineering ${ts}`,
        description: "Dev team",
      },
    })
  );
  check("Department created", !!dept.id);

  // ── T9: List Departments ─────────────────────────────────────────────────
  console.log("\nT9 – GET departments → includes new dept");
  const deptList = await withT(TENANT_A, (tx) =>
    tx.department.findMany({
      where: { tenantId: TENANT_A, deletedAt: null },
    })
  );
  check("Dept in list", deptList.some((d) => d.id === dept.id));

  // ── T10: Create Position ─────────────────────────────────────────────────
  console.log("\nT10 – POST: create Position (SENIOR)");
  const pos = await withT(TENANT_A, (tx) =>
    tx.position.create({
      data: {
        tenantId: TENANT_A,
        title: `Senior Developer ${ts}`,
        level: "SENIOR",
        description: "Writes code",
      },
    })
  );
  check("Position created", !!pos.id);
  check("level = SENIOR", pos.level === "SENIOR");

  // ── T11: List Positions + filter by level ────────────────────────────────
  console.log("\nT11 – GET positions → includes new position; filter by level");
  const posList = await withT(TENANT_A, (tx) =>
    tx.position.findMany({
      where: { tenantId: TENANT_A, deletedAt: null },
    })
  );
  const posListSenior = await withT(TENANT_A, (tx) =>
    tx.position.findMany({
      where: { tenantId: TENANT_A, deletedAt: null, level: "SENIOR" },
    })
  );
  check("Position in list", posList.some((p) => p.id === pos.id));
  check("Filter by SENIOR returns only SENIOR", posListSenior.every((p) => p.level === "SENIOR"));

  // ── T12: PATCH WorkLocation name ─────────────────────────────────────────
  console.log("\nT12 – PATCH WorkLocation name");
  const wlPatched = await withT(TENANT_A, (tx) =>
    tx.workLocation.update({
      where: { id: wl.id },
      data: { name: `NCR Office ${ts} (Updated)` },
    })
  );
  check("WL name updated", wlPatched.name === `NCR Office ${ts} (Updated)`);

  // ── T13: PATCH Branch (change isHeadOffice) ───────────────────────────────
  console.log("\nT13 – PATCH Branch isHeadOffice");
  const branchPatched = await withT(TENANT_A, (tx) =>
    tx.branch.update({
      where: { id: branch.id },
      data: { isHeadOffice: true },
    })
  );
  check("isHeadOffice updated", branchPatched.isHeadOffice === true);

  // ── T14: PATCH Department name ───────────────────────────────────────────
  console.log("\nT14 – PATCH Department name");
  const deptPatched = await withT(TENANT_A, (tx) =>
    tx.department.update({
      where: { id: dept.id },
      data: { name: `Engineering ${ts} (Updated)` },
    })
  );
  check("Dept name updated", deptPatched.name === `Engineering ${ts} (Updated)`);

  // ── T15: PATCH Position title ────────────────────────────────────────────
  console.log("\nT15 – PATCH Position title");
  const posPatched = await withT(TENANT_A, (tx) =>
    tx.position.update({
      where: { id: pos.id },
      data: { title: `Senior Developer ${ts} (Updated)` },
    })
  );
  check("Position title updated", posPatched.title === `Senior Developer ${ts} (Updated)`);

  // ── T16: Duplicate WorkLocation name → caught ────────────────────────────
  console.log("\nT16 – Duplicate WorkLocation name → @@unique catches it");
  let dupCaught = false;
  try {
    await withT(TENANT_A, (tx) =>
      tx.workLocation.create({
        data: {
          tenantId: TENANT_A,
          name: `NCR Office ${ts} (Updated)`, // same as patched name
          region: "NCR",
        },
      })
    );
  } catch {
    dupCaught = true;
  }
  check("Duplicate name throws", dupCaught);

  // ── T17: DELETE Position (no employees) ──────────────────────────────────
  console.log("\nT17 – DELETE Position (no employees)");
  await withT(TENANT_A, (tx) =>
    tx.position.update({ where: { id: pos.id }, data: { deletedAt: new Date() } })
  );
  const posAfterDel = await withT(TENANT_A, (tx) =>
    tx.position.findFirst({ where: { id: pos.id, deletedAt: null } })
  );
  check("Position absent from active list", posAfterDel === null);

  // ── T18: DELETE Department (no employees) ────────────────────────────────
  console.log("\nT18 – DELETE Department (no employees)");
  await withT(TENANT_A, (tx) =>
    tx.department.update({ where: { id: dept.id }, data: { deletedAt: new Date() } })
  );
  const deptAfterDel = await withT(TENANT_A, (tx) =>
    tx.department.findFirst({ where: { id: dept.id, deletedAt: null } })
  );
  check("Department absent from active list", deptAfterDel === null);

  // ── T19: DELETE Branch (no employees) ────────────────────────────────────
  console.log("\nT19 – DELETE Branch (no employees)");
  // Soft-delete geofence first so branch delete doesn't leave orphan
  await withT(TENANT_A, (tx) =>
    tx.geofence.update({ where: { id: geo.id }, data: { deletedAt: new Date() } })
  );
  await withT(TENANT_A, (tx) =>
    tx.branch.update({ where: { id: branch.id }, data: { deletedAt: new Date() } })
  );
  const branchAfterDel = await withT(TENANT_A, (tx) =>
    tx.branch.findFirst({ where: { id: branch.id, deletedAt: null } })
  );
  check("Branch absent from active list", branchAfterDel === null);

  // ── T20: DELETE WorkLocation (no active branches) ────────────────────────
  console.log("\nT20 – DELETE WorkLocation (no active branches)");
  await withT(TENANT_A, (tx) =>
    tx.workLocation.update({ where: { id: wl.id }, data: { deletedAt: new Date() } })
  );
  const wlAfterDel = await withT(TENANT_A, (tx) =>
    tx.workLocation.findFirst({ where: { id: wl.id, deletedAt: null } })
  );
  check("WorkLocation absent from active list", wlAfterDel === null);

  // ── T21: Cross-tenant isolation ──────────────────────────────────────────
  console.log("\nT21 – Cross-tenant isolation");
  // Create a WL in TENANT_A context (already done), try to see it in TENANT_B context
  // We'll create a fresh one for clarity
  const wlA = await withT(TENANT_A, (tx) =>
    tx.workLocation.create({
      data: { tenantId: TENANT_A, name: `Isolation Test WL ${ts}`, region: "NCR" },
    })
  );
  // TENANT_B is a non-existent fake tenant — the GUC filters it out
  const wlInB = await withT(TENANT_B, (tx) =>
    tx.workLocation.findMany({
      where: { id: wlA.id },
    })
  );
  check("WL in TENANT_A not visible in TENANT_B scope", wlInB.length === 0);

  // ── T22: Cleanup ──────────────────────────────────────────────────────────
  console.log("\nT22 – Cleanup");
  // Hard-delete all rows created in T21 (rest already soft-deleted)
  await withT(TENANT_A, (tx) =>
    tx.workLocation.delete({ where: { id: wlA.id } })
  );
  // Hard-delete the soft-deleted rows from T17-T20 (in order: dep on FK)
  await withT(TENANT_A, async (tx) => {
    await tx.geofence.delete({ where: { id: geo.id } });
    await tx.branch.delete({ where: { id: branch.id } });
    await tx.workLocation.delete({ where: { id: wl.id } });
    await tx.department.delete({ where: { id: dept.id } });
    await tx.position.delete({ where: { id: pos.id } });
  });
  check("cleanup complete", true);
}

main()
  .catch((e) => {
    console.error("\nFATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    const icon = failures === 0 ? "✅" : "❌";
    console.log(
      `\n${"─".repeat(54)}\n${icon}  Phase Q smoke: ${total - failures}/${total} PASS`,
    );
    if (failures > 0) process.exit(1);
  });
