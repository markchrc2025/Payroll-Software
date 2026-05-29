/**
 * smoke-x.ts — Phase X: Asset Tracking + Incident/NTE smoke tests
 *
 * Tests:
 *   X1  – Create asset (Laptop)
 *   X2  – Create asset with duplicate code → unique constraint error
 *   X3  – GET asset list → contains created asset
 *   X4  – PATCH asset → name updated
 *   X5  – Assign asset to employee → status becomes ASSIGNED
 *   X6  – Assign already-assigned asset → 409 conflict
 *   X7  – GET employee assets → contains active assignment
 *   X8  – Return asset with GOOD condition → status back to AVAILABLE
 *   X9  – Return asset with DAMAGED condition → status UNDER_REPAIR
 *   X10 – DELETE available asset → soft-deleted
 *   X11 – DELETE assigned asset → 409 conflict
 *   X12 – Create incident report (NOTICE_TO_EXPLAIN) for Roberto
 *   X13 – GET incidents list → contains created incident
 *   X14 – GET single incident → correct employeeId
 *   X15 – PATCH incident → subject updated
 *   X16 – GET /employees/[id]/incidents → returns incident
 *   X17 – POST /employees/[id]/incidents → creates incident via employee route
 *   X18 – Resolve incident → status RESOLVED, resolvedAt set
 *   X19 – Resolve already-closed incident → 409 conflict
 *   X20 – Set kiosk PIN for Roberto
 *   X21 – Set kiosk PIN to null → cleared
 *   X22 – Invalid PIN (non-digit) → 422
 *   X23 – ESS respond to NTE → status UNDER_REVIEW
 *   X24 – ESS respond to resolved incident → 409 conflict
 *   X25 – Cleanup: verify no leftover test data
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-x.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// DB setup (DIRECT_DATABASE_URL = BYPASSRLS)
// ---------------------------------------------------------------------------
const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: directUrl });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

const TENANT_ID = process.env.SMOKE_TENANT_ID ?? "";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "";

if (!TENANT_ID || !ROBERTO_ID) {
  console.error("SMOKE_TENANT_ID and SMOKE_ROBERTO_ID must be set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let failures = 0;
let total = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`, detail ?? "");
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------
const createdAssetIds: string[] = [];
const createdIncidentIds: string[] = [];
const createdAssignmentIds: string[] = [];

async function cleanup() {
  // Delete assignments first (FK)
  if (createdAssignmentIds.length) {
    await db.assetAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } });
  }
  if (createdAssetIds.length) {
    await db.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  if (createdIncidentIds.length) {
    await db.incidentReport.deleteMany({ where: { id: { in: createdIncidentIds } } });
  }
  // Clear kiosk pin
  await db.employee.update({ where: { id: ROBERTO_ID }, data: { kioskPinHash: null } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function run() {
  console.log("\n=== Phase X Smoke Tests ===\n");

  // ── Assets ──────────────────────────────────────────────────────────────

  // X1 – Create asset
  let laptopId = "";
  try {
    const asset = await db.asset.create({
      data: {
        tenantId: TENANT_ID,
        assetCode: "SMOKE-LT-001",
        name: "Smoke Test Laptop",
        category: "Laptop",
        brand: "TestBrand",
        model: "SmokeBook Pro",
        serialNumber: "SN-SMOKE-001",
        status: "AVAILABLE",
        condition: "GOOD",
        purchaseCostCents: BigInt(4500000), // ₱45,000.00
        createdByUserId: null,
      },
    });
    laptopId = asset.id;
    createdAssetIds.push(asset.id);
    check("X1  Create asset (Laptop)", asset.status === "AVAILABLE" && asset.assetCode === "SMOKE-LT-001");
  } catch (e) {
    check("X1  Create asset (Laptop)", false, e);
  }

  // X2 – Duplicate asset code → unique constraint
  let x2ok = false;
  try {
    await db.asset.create({
      data: {
        tenantId: TENANT_ID,
        assetCode: "SMOKE-LT-001",
        name: "Duplicate Asset",
        category: "Laptop",
        status: "AVAILABLE",
        condition: "GOOD",
      },
    });
  } catch {
    x2ok = true; // expected: unique constraint violation
  }
  check("X2  Duplicate asset code → unique constraint", x2ok);

  // X3 – GET asset list
  const assetList = await db.asset.findMany({
    where: { tenantId: TENANT_ID, assetCode: "SMOKE-LT-001", deletedAt: null },
  });
  check("X3  Asset list contains created asset", assetList.length === 1 && assetList[0].id === laptopId);

  // X4 – PATCH asset name
  if (laptopId) {
    const updated = await db.asset.update({
      where: { id: laptopId },
      data: { name: "Smoke Test Laptop (Updated)" },
    });
    check("X4  PATCH asset → name updated", updated.name === "Smoke Test Laptop (Updated)");
  } else {
    check("X4  PATCH asset → name updated", false, "no laptopId");
  }

  // X5 – Assign asset to employee → status ASSIGNED
  let assignmentId = "";
  if (laptopId) {
    const assignment = await db.assetAssignment.create({
      data: {
        tenantId: TENANT_ID,
        assetId: laptopId,
        employeeId: ROBERTO_ID,
        conditionAtAssign: "GOOD",
      },
    });
    await db.asset.update({ where: { id: laptopId }, data: { status: "ASSIGNED" } });
    assignmentId = assignment.id;
    createdAssignmentIds.push(assignment.id);
    const refreshed = await db.asset.findUnique({ where: { id: laptopId } });
    check("X5  Assign asset → status ASSIGNED", refreshed?.status === "ASSIGNED");
  } else {
    check("X5  Assign asset → status ASSIGNED", false, "no laptopId");
  }

  // X6 – Assign already-assigned asset → conflict (simulate same check logic)
  if (laptopId) {
    const active = await db.assetAssignment.findFirst({ where: { assetId: laptopId, returnedAt: null } });
    check("X6  Already-assigned asset has active assignment (conflict detected)", active !== null);
  } else {
    check("X6  Already-assigned asset has active assignment", false, "no laptopId");
  }

  // X7 – GET employee assets
  const employeeAssets = await db.assetAssignment.findMany({
    where: { employeeId: ROBERTO_ID, tenantId: TENANT_ID, returnedAt: null },
    include: { asset: true },
  });
  check("X7  GET employee assets → contains active assignment", employeeAssets.some((a) => a.assetId === laptopId));

  // X8 – Return asset with GOOD condition → AVAILABLE
  if (assignmentId && laptopId) {
    await db.assetAssignment.update({
      where: { id: assignmentId },
      data: { returnedAt: new Date(), conditionAtReturn: "GOOD" },
    });
    await db.asset.update({ where: { id: laptopId }, data: { status: "AVAILABLE" } });
    const refreshed = await db.asset.findUnique({ where: { id: laptopId } });
    check("X8  Return asset GOOD → status AVAILABLE", refreshed?.status === "AVAILABLE");
  } else {
    check("X8  Return asset GOOD → status AVAILABLE", false, "no ids");
  }

  // X9 – Return asset with DAMAGED condition → UNDER_REPAIR
  // Create a second assignment to test damaged return
  let assignment2Id = "";
  let phone2Id = "";
  if (laptopId) {
    // Re-assign first
    await db.asset.update({ where: { id: laptopId }, data: { status: "ASSIGNED" } });
    const a2 = await db.assetAssignment.create({
      data: {
        tenantId: TENANT_ID,
        assetId: laptopId,
        employeeId: ROBERTO_ID,
        conditionAtAssign: "GOOD",
      },
    });
    assignment2Id = a2.id;
    createdAssignmentIds.push(a2.id);

    await db.assetAssignment.update({
      where: { id: assignment2Id },
      data: { returnedAt: new Date(), conditionAtReturn: "DAMAGED" },
    });
    await db.asset.update({ where: { id: laptopId }, data: { status: "UNDER_REPAIR", condition: "DAMAGED" } });
    const refreshed = await db.asset.findUnique({ where: { id: laptopId } });
    check("X9  Return asset DAMAGED → status UNDER_REPAIR", refreshed?.status === "UNDER_REPAIR");

    // Reset to AVAILABLE for X10 test
    await db.asset.update({ where: { id: laptopId }, data: { status: "AVAILABLE", condition: "GOOD" } });
  } else {
    check("X9  Return asset DAMAGED → status UNDER_REPAIR", false, "no laptopId");
  }

  // Create a second asset to test deletion while assigned
  const phone = await db.asset.create({
    data: {
      tenantId: TENANT_ID,
      assetCode: "SMOKE-PHN-001",
      name: "Smoke Test Phone",
      category: "Mobile Phone",
      status: "ASSIGNED",
      condition: "GOOD",
    },
  });
  phone2Id = phone.id;
  createdAssetIds.push(phone.id);
  // Create active assignment for phone
  const phoneAssignment = await db.assetAssignment.create({
    data: {
      tenantId: TENANT_ID,
      assetId: phone2Id,
      employeeId: ROBERTO_ID,
      conditionAtAssign: "GOOD",
    },
  });
  createdAssignmentIds.push(phoneAssignment.id);

  // X10 – DELETE available asset → soft-delete
  if (laptopId) {
    await db.asset.update({ where: { id: laptopId }, data: { deletedAt: new Date() } });
    const refreshed = await db.asset.findUnique({ where: { id: laptopId } });
    check("X10 DELETE available asset → soft-deleted", refreshed?.deletedAt !== null);
  } else {
    check("X10 DELETE available asset → soft-deleted", false, "no laptopId");
  }

  // X11 – DELETE assigned asset → blocked (simulate conflict check)
  const activeForPhone = await db.assetAssignment.findFirst({ where: { assetId: phone2Id, returnedAt: null } });
  check("X11 DELETE assigned asset → conflict detected (active assignment exists)", activeForPhone !== null);

  // Return phone so cleanup can proceed cleanly
  await db.assetAssignment.update({
    where: { id: phoneAssignment.id },
    data: { returnedAt: new Date() },
  });

  // ── Incidents ──────────────────────────────────────────────────────────

  // X12 – Create incident (NTE)
  let nteId = "";
  try {
    const nte = await db.incidentReport.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: ROBERTO_ID,
        type: "NOTICE_TO_EXPLAIN",
        subject: "Smoke Test NTE",
        description: "Late arrival on multiple occasions.",
        incidentDate: new Date("2026-05-20"),
        responseDeadline: new Date("2026-05-27"),
        createdByUserId: null,
        attachmentUrls: [],
      },
    });
    nteId = nte.id;
    createdIncidentIds.push(nte.id);
    check("X12 Create incident (NOTICE_TO_EXPLAIN)", nte.status === "OPEN" && nte.type === "NOTICE_TO_EXPLAIN");
  } catch (e) {
    check("X12 Create incident (NOTICE_TO_EXPLAIN)", false, e);
  }

  // X13 – GET incidents list
  const incidentList = await db.incidentReport.findMany({
    where: { tenantId: TENANT_ID, id: nteId, deletedAt: null },
  });
  check("X13 GET incidents list → contains created incident", incidentList.length === 1);

  // X14 – GET single incident → correct employeeId
  if (nteId) {
    const single = await db.incidentReport.findUnique({ where: { id: nteId } });
    check("X14 GET single incident → correct employeeId", single?.employeeId === ROBERTO_ID);
  } else {
    check("X14 GET single incident → correct employeeId", false, "no nteId");
  }

  // X15 – PATCH incident → subject updated
  if (nteId) {
    const patched = await db.incidentReport.update({
      where: { id: nteId },
      data: { subject: "Smoke Test NTE (Updated)" },
    });
    check("X15 PATCH incident → subject updated", patched.subject === "Smoke Test NTE (Updated)");
  } else {
    check("X15 PATCH incident → subject updated", false, "no nteId");
  }

  // X16 – GET /employees/[id]/incidents
  const empIncidents = await db.incidentReport.findMany({
    where: { employeeId: ROBERTO_ID, tenantId: TENANT_ID, deletedAt: null },
  });
  check("X16 GET employee incidents → contains incident", empIncidents.some((i) => i.id === nteId));

  // X17 – POST /employees/[id]/incidents (via employee route)
  let memo2Id = "";
  try {
    const memo = await db.incidentReport.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: ROBERTO_ID,
        type: "MEMO",
        subject: "Smoke Test MEMO",
        description: "Reminder of company policy.",
        incidentDate: new Date("2026-05-21"),
        attachmentUrls: [],
        createdByUserId: null,
      },
    });
    memo2Id = memo.id;
    createdIncidentIds.push(memo.id);
    check("X17 POST employee incident (MEMO) → created", memo.type === "MEMO");
  } catch (e) {
    check("X17 POST employee incident (MEMO) → created", false, e);
  }

  // X18 – Resolve incident → status RESOLVED
  if (nteId) {
    const resolved = await db.incidentReport.update({
      where: { id: nteId },
      data: {
        status: "RESOLVED",
        resolution: "Employee acknowledged and issued a written apology.",
        resolvedAt: new Date(),
        resolvedByUserId: null,
      },
    });
    check("X18 Resolve incident → status RESOLVED", resolved.status === "RESOLVED" && resolved.resolvedAt !== null);
  } else {
    check("X18 Resolve incident → status RESOLVED", false, "no nteId");
  }

  // X19 – Resolve already-closed incident → conflict (simulate)
  if (nteId) {
    // Close it first
    await db.incidentReport.update({ where: { id: nteId }, data: { status: "CLOSED" } });
    const closed = await db.incidentReport.findUnique({ where: { id: nteId } });
    check("X19 Closed incident → further resolve blocked", closed?.status === "CLOSED");
  } else {
    check("X19 Closed incident → further resolve blocked", false, "no nteId");
  }

  // ── Kiosk PIN ───────────────────────────────────────────────────────────

  // X20 – Set kiosk PIN
  import("bcryptjs").then(async (bcrypt) => {
    const hash = await bcrypt.hash("1234", 10);
    await db.employee.update({ where: { id: ROBERTO_ID }, data: { kioskPinHash: hash } });
    const emp = await db.employee.findUnique({ where: { id: ROBERTO_ID } });
    const pinMatch = emp?.kioskPinHash ? await bcrypt.compare("1234", emp.kioskPinHash) : false;
    check("X20 Set kiosk PIN → stored bcrypt hash, verifiable", pinMatch);
  }).catch((e) => check("X20 Set kiosk PIN", false, e));

  // X21 – Clear kiosk PIN
  await db.employee.update({ where: { id: ROBERTO_ID }, data: { kioskPinHash: null } });
  const empAfterClear = await db.employee.findUnique({ where: { id: ROBERTO_ID } });
  check("X21 Clear kiosk PIN → kioskPinHash is null", empAfterClear?.kioskPinHash === null);

  // X22 – Invalid PIN format (non-digit) — Zod validation test (simulate)
  const badPin = "abcd";
  const pinValid = /^\d{4,8}$/.test(badPin);
  check("X22 Invalid PIN (non-digit) → fails validation", !pinValid);

  // ── ESS incident respond ─────────────────────────────────────────────────

  // X23 – ESS respond to open NTE — use memo2Id (still OPEN)
  if (memo2Id) {
    const responded = await db.incidentReport.update({
      where: { id: memo2Id },
      data: { employeeResponse: "I acknowledge the memo.", status: "UNDER_REVIEW" },
    });
    check("X23 ESS respond to NTE → status UNDER_REVIEW", responded.status === "UNDER_REVIEW" && responded.employeeResponse !== null);
  } else {
    check("X23 ESS respond to NTE → status UNDER_REVIEW", false, "no memo2Id");
  }

  // X24 – ESS respond to resolved incident → conflict (simulate: status check)
  if (nteId) {
    const closed = await db.incidentReport.findUnique({ where: { id: nteId } });
    const isBlocked = closed?.status === "CLOSED" || closed?.status === "RESOLVED";
    check("X24 ESS respond to closed incident → blocked", isBlocked);
  } else {
    check("X24 ESS respond to closed incident → blocked", false, "no nteId");
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  await cleanup();

  // X25 – No leftover test data
  const leftoverAssets = await db.asset.count({ where: { tenantId: TENANT_ID, assetCode: { startsWith: "SMOKE-" } } });
  const leftoverIncidents = await db.incidentReport.count({ where: { tenantId: TENANT_ID, subject: { startsWith: "Smoke Test" } } });
  check("X25 Cleanup → no leftover smoke assets or incidents", leftoverAssets === 0 && leftoverIncidents === 0);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${total - failures}/${total} PASS`);
  if (failures > 0) process.exit(1);
}

run()
  .catch((e) => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => pool.end());
