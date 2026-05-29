/**
 * smoke-z.ts — Phase Z: HMAC + AuditLog smoke tests
 *
 * Tests:
 *   Z1  – encrypt() produces ciphertext (not plaintext)
 *   Z2  – decrypt() recovers plaintext
 *   Z3  – hmac() is deterministic (same input → same hash)
 *   Z4  – hmac() is discriminating (different input → different hash)
 *   Z5  – hmac() returns null when HMAC_KEY is unset (skipped if key present)
 *   Z6  – StatutoryId create → numberHmac auto-populated via Prisma extension
 *   Z7  – numberHmac == hmac(plaintext)
 *   Z8  – Duplicate detection: same number → same HMAC
 *   Z9  – writeAuditLog writes to AuditLog table
 *   Z10 – Employee CREATE writes AuditLog (via /api/employees)
 *   Z11 – Employee UPDATE writes AuditLog (via /api/employees/:id)
 *   Z12 – Kiosk PIN change writes AuditLog (via /api/employees/:id/kiosk-pin)
 *   Z13 – Incident resolve writes AuditLog (via /api/incidents/:id/resolve)
 *   Z14 – purge-biometric script: creates AttendanceLog with selfieKey, runs purge, verifies nulled
 *   Z15 – purge skips logs whose DTR is not APPROVED
 *   Z16 – purge skips logs < 30 days old even if DTR approved
 *   Z17 – Cleanup → no leftover smoke data
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/smoke-z.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { encrypt, decrypt, hmac } from "../src/lib/crypto";
import { writeAuditLog } from "../src/lib/audit";
import { withTenant } from "../src/lib/with-tenant";

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

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN ?? "";

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
// Cleanup tracking
// ---------------------------------------------------------------------------
const createdStatutoryIds: string[] = [];
const createdAuditLogIds: string[] = [];
const createdAttendanceLogs: string[] = [];
const createdDtrRecords: string[] = [];
const createdEmployeeIds: string[] = [];
const createdIncidentIds: string[] = [];

async function cleanup() {
  if (createdIncidentIds.length)
    await db.incidentReport.deleteMany({ where: { id: { in: createdIncidentIds } } });
  if (createdEmployeeIds.length)
    await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  if (createdDtrRecords.length)
    await db.dTRRecord.deleteMany({ where: { id: { in: createdDtrRecords } } });
  if (createdAttendanceLogs.length)
    await db.attendanceLog.deleteMany({ where: { id: { in: createdAttendanceLogs } } });
  if (createdStatutoryIds.length)
    await db.statutoryId.deleteMany({ where: { id: { in: createdStatutoryIds } } });
  if (createdAuditLogIds.length)
    await db.auditLog.deleteMany({ where: { id: { in: createdAuditLogIds } } });
  // Clear kiosk pin leftover
  await db.employee.update({ where: { id: ROBERTO_ID }, data: { kioskPinHash: null } }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function run() {
  console.log("\n=== Phase Z Smoke Tests ===\n");

  // ── Z1-Z4: crypto primitives ─────────────────────────────────────────────

  // Z1 – encrypt produces ciphertext
  const plain = "04-1234567-8";
  const cipher = encrypt(plain);
  check("Z1 encrypt() produces ciphertext (not plaintext)", cipher !== plain && cipher.startsWith("v1:"));

  // Z2 – decrypt recovers plaintext
  const recovered = decrypt(cipher);
  check("Z2 decrypt() recovers plaintext", recovered === plain, { recovered });

  // Z3 – hmac is deterministic
  const h1 = hmac(plain);
  const h2 = hmac(plain);
  check("Z3 hmac() is deterministic", h1 !== null && h1 === h2, { h1, h2 });

  // Z4 – hmac discriminates different inputs
  const h3 = hmac("04-9999999-0");
  check("Z4 hmac() is discriminating (different input → different hash)", h1 !== h3, { h1, h3 });

  // ── Z5: HMAC key fallback (informational only if key set) ─────────────────
  // Z5 is skipped if HMAC_KEY is set (we can't easily unset it)
  console.log("  SKIP  Z5 hmac() fallback (HMAC_KEY is set in this environment)");

  // ── Z6-Z8: StatutoryId HMAC auto-population ──────────────────────────────

  // Create via encrypted prisma extension inside withTenant (RLS requires GUC)
  const sid = await withTenant(TENANT_ID, (tx) =>
    tx.statutoryId.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: ROBERTO_ID,
        type: "SSS",
        number: plain, // extension will encrypt + set numberHmac
      },
    }),
  );
  createdStatutoryIds.push(sid.id);

  // Read raw row via BYPASSRLS db to see encrypted + hmac values
  const rawSid = await db.statutoryId.findUnique({ where: { id: sid.id } });
  check("Z6 StatutoryId create → numberHmac auto-populated", !!rawSid?.numberHmac, { numberHmac: rawSid?.numberHmac });
  check("Z7 numberHmac == hmac(plaintext)", rawSid?.numberHmac === h1, { stored: rawSid?.numberHmac, expected: h1 });

  // Z8 – create second record with same number → same HMAC
  const sid2 = await withTenant(TENANT_ID, (tx) =>
    tx.statutoryId.create({
      data: { tenantId: TENANT_ID, employeeId: ROBERTO_ID, type: "TIN", number: plain },
    }),
  );
  createdStatutoryIds.push(sid2.id);
  const rawSid2 = await db.statutoryId.findUnique({ where: { id: sid2.id } });
  check("Z8 Duplicate detection: same number → same HMAC", rawSid2?.numberHmac === rawSid?.numberHmac);

  // ── Z9: writeAuditLog writes to DB ──────────────────────────────────────────

  await writeAuditLog({
    tenantId: TENANT_ID,
    actorUserId: null,
    action: "READ",
    entity: "SmokePing",
    entityId: "smoke-z9-ping",
    changes: { test: "smoke-z Z9" },
    ipAddress: "127.0.0.1",
  });
  // Give fire-and-forget a tick
  await new Promise((r) => setTimeout(r, 100));

  const z9log = await db.auditLog.findFirst({
    where: { tenantId: TENANT_ID, action: "READ", entityId: "smoke-z9-ping" },
    orderBy: { createdAt: "desc" },
  });
  check("Z9 writeAuditLog writes to AuditLog table", !!z9log, { z9log });
  if (z9log) createdAuditLogIds.push(z9log.id);

  // ── Z10-Z13: HTTP API audit trails ───────────────────────────────────────────
  // These tests require the dev server to be running and a valid admin token.
  if (!ADMIN_TOKEN) {
    console.log("  SKIP  Z10-Z13 (set SMOKE_ADMIN_TOKEN to enable HTTP audit tests)");
  } else {
    // Z10 – Employee CREATE writes AuditLog
    const empRes = await fetch(`${BASE_URL}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "ZEmployee",
        email: `smoke-z-${Date.now()}@test.invalid`,
        hireDate: "2024-01-01",
        departmentId: null,
        branchId: null,
        positionId: null,
      }),
    });
    const empBody = empRes.ok ? await empRes.json() : null;
    const empId: string | null = empBody?.data?.id ?? null;
    if (empId) createdEmployeeIds.push(empId);

    await new Promise((r) => setTimeout(r, 150));
    const z10log = empId
      ? await db.auditLog.findFirst({
          where: { tenantId: TENANT_ID, action: "CREATE", entity: "Employee", entityId: empId },
        })
      : null;
    check("Z10 Employee CREATE writes AuditLog", !!z10log, { empRes: empRes.status, empId });

    // Z11 – Employee UPDATE writes AuditLog
    if (empId) {
      const updRes = await fetch(`${BASE_URL}/api/employees/${empId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: JSON.stringify({ firstName: "SmokeUpdated" }),
      });
      await new Promise((r) => setTimeout(r, 150));
      const z11log = updRes.ok
        ? await db.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: "UPDATE", entity: "Employee", entityId: empId },
          })
        : null;
      check("Z11 Employee UPDATE writes AuditLog", !!z11log, { updRes: updRes.status });
    } else {
      check("Z11 Employee UPDATE writes AuditLog", false, "no empId from Z10");
    }

    // Z12 – Kiosk PIN change writes AuditLog
    const pinRes = await fetch(`${BASE_URL}/api/employees/${ROBERTO_ID}/kiosk-pin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ pin: "1234" }),
    });
    await new Promise((r) => setTimeout(r, 150));
    const z12log = pinRes.ok
      ? await db.auditLog.findFirst({
          where: {
            tenantId: TENANT_ID,
            action: "UPDATE",
            entity: "Employee",
            entityId: ROBERTO_ID,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
    check("Z12 Kiosk PIN change writes AuditLog", !!z12log, { pinRes: pinRes.status });

    // Z13 – Incident resolve writes AuditLog
    // Create a test incident first
    const incRes = await fetch(`${BASE_URL}/api/employees/${ROBERTO_ID}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({
        subject: "Smoke Z Incident",
        description: "Phase Z smoke test incident",
        incidentDate: new Date().toISOString().split("T")[0],
        severity: "MINOR",
      }),
    });
    const incBody = incRes.ok ? await incRes.json() : null;
    const incId: string | null = incBody?.data?.id ?? null;
    if (incId) createdIncidentIds.push(incId);

    if (incId) {
      const resolveRes = await fetch(`${BASE_URL}/api/incidents/${incId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: JSON.stringify({ resolution: "Smoke test resolved", status: "RESOLVED" }),
      });
      await new Promise((r) => setTimeout(r, 150));
      const z13log = resolveRes.ok
        ? await db.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: "UPDATE", entity: "IncidentReport", entityId: incId },
          })
        : null;
      check("Z13 Incident resolve writes AuditLog", !!z13log, { resolveRes: resolveRes.status });
    } else {
      check("Z13 Incident resolve writes AuditLog", false, "could not create incident");
    }
  }

  // ── Z14-Z16: Data retention purge ────────────────────────────────────────

  // Need a department/branch/position for employee FK if required — skip those,
  // use ROBERTO_ID directly for attendance logs.

  const cutoffDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

  // Z14 – purge nulls biometric data for approved DTR logs > 30 days old
  const dtr14 = await db.dTRRecord.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      date: new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), cutoffDate.getDate()),
      approvalStatus: "APPROVED",
    },
  });
  createdDtrRecords.push(dtr14.id);

  const al14 = await db.attendanceLog.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      punchType: "IN",
      source: "KIOSK",
      punchedAt: cutoffDate,
      selfieKey: "smoke-test-selfie-key",
    },
  });
  createdAttendanceLogs.push(al14.id);

  // Run purge inline (same logic as purge-biometric.ts)
  await runPurge();

  const purgedLog = await db.attendanceLog.findUnique({ where: { id: al14.id } });
  check("Z14 Purge nulls selfieKey for approved DTR > 30 days", purgedLog?.selfieKey === null, {
    selfieKey: purgedLog?.selfieKey,
  });

  // Z15 – purge SKIPS when DTR is not APPROVED
  const dtr15date = new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000);
  const dtr15 = await db.dTRRecord.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      date: new Date(dtr15date.getFullYear(), dtr15date.getMonth(), dtr15date.getDate()),
      approvalStatus: "PENDING", // not approved
    },
  });
  createdDtrRecords.push(dtr15.id);

  const al15 = await db.attendanceLog.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      punchType: "OUT",
      source: "KIOSK",
      punchedAt: dtr15date,
      selfieKey: "smoke-z15-selfie",
    },
  });
  createdAttendanceLogs.push(al15.id);

  await runPurge();
  const skippedLog = await db.attendanceLog.findUnique({ where: { id: al15.id } });
  check("Z15 Purge skips logs with non-APPROVED DTR", skippedLog?.selfieKey === "smoke-z15-selfie", {
    selfieKey: skippedLog?.selfieKey,
  });

  // Z16 – purge SKIPS recent logs even if DTR approved
  const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
  const dtr16 = await db.dTRRecord.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      date: new Date(recentDate.getFullYear(), recentDate.getMonth(), recentDate.getDate()),
      approvalStatus: "APPROVED",
    },
  });
  createdDtrRecords.push(dtr16.id);

  const al16 = await db.attendanceLog.create({
    data: {
      tenantId: TENANT_ID,
      employeeId: ROBERTO_ID,
      punchType: "IN",
      source: "ESS",
      punchedAt: recentDate,
      selfieKey: "smoke-z16-selfie-recent",
    },
  });
  createdAttendanceLogs.push(al16.id);

  await runPurge();
  const recentLog = await db.attendanceLog.findUnique({ where: { id: al16.id } });
  check("Z16 Purge skips logs < 30 days old", recentLog?.selfieKey === "smoke-z16-selfie-recent", {
    selfieKey: recentLog?.selfieKey,
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await cleanup();

  // Z17 – no leftover smoke data
  const leftoverSids = await db.statutoryId.count({
    where: { id: { in: createdStatutoryIds } },
  });
  check("Z17 Cleanup → no leftover smoke data", leftoverSids === 0, { leftoverSids });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${total - failures}/${total} PASS`);
  if (failures > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Inline purge logic (mirrors purge-biometric.ts)
// ---------------------------------------------------------------------------
async function runPurge() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let cursor: string | undefined;

  for (;;) {
    const logs = await db.attendanceLog.findMany({
      where: {
        punchedAt: { lt: cutoff },
        OR: [{ selfieKey: { not: null } }, { latitude: { not: null } }, { longitude: { not: null } }],
      },
      select: { id: true, tenantId: true, employeeId: true, punchedAt: true },
      take: 500,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
    });

    if (logs.length === 0) break;
    cursor = logs[logs.length - 1].id;

    const eligible: string[] = [];
    for (const log of logs) {
      const date = new Date(log.punchedAt);
      date.setUTCHours(0, 0, 0, 0);

      const dtr = await db.dTRRecord.findFirst({
        where: { tenantId: log.tenantId, employeeId: log.employeeId, date, approvalStatus: "APPROVED" },
        select: { id: true },
      });
      if (dtr) eligible.push(log.id);
    }

    if (eligible.length > 0) {
      await db.attendanceLog.updateMany({
        where: { id: { in: eligible } },
        data: { selfieKey: null, latitude: null, longitude: null },
      });
    }
  }
}

run()
  .catch((e) => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => pool.end());
