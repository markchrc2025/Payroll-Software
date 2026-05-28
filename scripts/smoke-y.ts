/**
 * smoke-y.ts — Phase Y: Kiosk + ESS Clock-In smoke tests
 *
 * Tests:
 *   Y1  – computeDtrFields: no punches → ABSENT
 *   Y2  – computeDtrFields: IN only → PRESENT, workedMinutes = 0
 *   Y3  – computeDtrFields: IN+OUT with shift → lateMinutes, workedMinutes, nsdMinutes
 *   Y4  – checkGeofence: null geofence → not flagged
 *   Y5  – checkGeofence: inside radius → not flagged, distance computed
 *   Y6  – checkGeofence: outside radius → flagged, distance computed
 *   Y7  – executePunch: no selfie/GPS → succeeds, creates AttendanceLog + DTRRecord
 *   Y8  – executePunch: GPS without consent → NO_CONSENT
 *   Y9  – executePunch: GPS with GEOLOCATION consent → succeeds, outsideGeofence flag
 *   Y10 – executePunch: selfie without consent → NO_CONSENT
 *   Y11 – executePunch: selfie with BIOMETRIC_SELFIE consent → succeeds, selfieKey stored
 *   Y12 – executePunch: DTR locked → DTR_LOCKED
 *   Y13 – Kiosk DB: create kiosk → deviceToken is unique, isActive = true
 *   Y14 – AttendanceLog count = 3 smoke rows (Y7 + Y9 + Y11)
 *   Y15 – nsdMinutes: punch 22:00–23:30 on a day shift → 90 nsd minutes
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-y.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { computeDtrFields } from "../src/lib/attendance/compute-dtr";
import { checkGeofence }    from "../src/lib/attendance/geofence";
import { executePunch }     from "../src/lib/attendance/punch";

// ---------------------------------------------------------------------------
// DB setup (DIRECT_DATABASE_URL = BYPASSRLS)
// ---------------------------------------------------------------------------
const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
const pool      = new Pool({ connectionString: directUrl });
const adapter   = new PrismaPg(pool);
const db        = new PrismaClient({ adapter });

const TENANT_ID  = process.env.SMOKE_TENANT_ID  ?? "";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "";

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
// Helpers
// ---------------------------------------------------------------------------
// Today's UTC midnight — used for DB cleanup and count filters (executePunch uses new Date() internally)
const todayMidnight = new Date();
todayMidnight.setUTCHours(0, 0, 0, 0);
const tomorrowMidnight = new Date(todayMidnight.getTime() + 86_400_000);

// Fixed date for pure-function tests (no DB writes)
const DATE_UTC = new Date("2026-06-01T00:00:00.000Z");
const SHIFT = {
  timeIn:         "08:00",
  timeOut:        "17:00",
  breakMinutes:   60,
  crossesMidnight: false,
};

function punchAt(h: number, m: number) {
  const d = new Date(DATE_UTC);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

// Geofence at Makati city center (lat 14.5547, lng 121.0244), 100 m radius
const GEOFENCE = { latitude: 14.5547, longitude: 121.0244, radiusMeters: 100 };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_ID || !ROBERTO_ID) throw new Error("SMOKE_TENANT_ID or SMOKE_ROBERTO_ID not set");

  console.log("Phase Y — Kiosk + ESS Clock-In\n");

  // Clean any leftover test data for today
  await db.attendanceLog.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID,
      punchedAt: { gte: todayMidnight, lt: tomorrowMidnight } },
  });
  await db.dTRRecord.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID, date: todayMidnight },
  });
  await db.consentRecord.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID },
  });
  await db.kiosk.deleteMany({
    where: { tenantId: TENANT_ID, name: "Smoke Kiosk Y" },
  });
  await db.shiftSchedule.deleteMany({
    where: { tenantId: TENANT_ID, name: "Smoke Shift Y" },
  });

  // ── Y1: computeDtrFields — no punches → ABSENT ────────────────────────────
  console.log("Y1 – computeDtrFields: no punches → ABSENT");
  const r1 = computeDtrFields(DATE_UTC, [], SHIFT);
  check("Y1 dayStatus = ABSENT",        r1.dayStatus       === "ABSENT");
  check("Y1 workedMinutes = 0",         r1.workedMinutes   === 0);
  check("Y1 lateMinutes = 0",           r1.lateMinutes     === 0);
  check("Y1 undertimeMinutes = 0",      r1.undertimeMinutes === 0);

  // ── Y2: computeDtrFields — IN only → PRESENT, workedMinutes = 0 ───────────
  console.log("\nY2 – computeDtrFields: IN only → PRESENT");
  const r2 = computeDtrFields(DATE_UTC, [{ punchType: "IN", punchedAt: punchAt(8, 15) }], SHIFT);
  check("Y2 dayStatus = PRESENT",       r2.dayStatus       === "PRESENT");
  check("Y2 workedMinutes = 0",         r2.workedMinutes   === 0);
  check("Y2 lateMinutes = 15",          r2.lateMinutes     === 15);

  // ── Y3: IN+OUT with shift ─────────────────────────────────────────────────
  console.log("\nY3 – computeDtrFields: IN+OUT with shift");
  // IN at 08:20 (20 min late), OUT at 16:45 (15 min undertime)
  // workedMinutes = (16:45 − 08:20) − 60 break = 505 − 60 = 445 min
  const r3 = computeDtrFields(
    DATE_UTC,
    [
      { punchType: "IN",  punchedAt: punchAt(8,  20) },
      { punchType: "OUT", punchedAt: punchAt(16, 45) },
    ],
    SHIFT,
  );
  check("Y3 dayStatus = PRESENT",       r3.dayStatus        === "PRESENT");
  check("Y3 lateMinutes = 20",          r3.lateMinutes      === 20);
  check("Y3 undertimeMinutes = 15",     r3.undertimeMinutes === 15);
  check("Y3 workedMinutes = 445",       r3.workedMinutes    === 445);
  check("Y3 nsdMinutes = 0 (day shift)", r3.nsdMinutes      === 0);

  // ── Y4: checkGeofence — null geofence ─────────────────────────────────────
  console.log("\nY4 – checkGeofence: null geofence → not flagged");
  const r4 = checkGeofence(14.5547, 121.0244, null);
  check("Y4 outsideGeofence = false",   r4.outsideGeofence  === false);
  check("Y4 distanceMeters = null",     r4.distanceMeters   === null);

  // ── Y5: checkGeofence — inside ────────────────────────────────────────────
  console.log("\nY5 – checkGeofence: inside radius → not flagged");
  // Same coords as geofence centre → distance ≈ 0
  const r5 = checkGeofence(14.5547, 121.0244, GEOFENCE);
  check("Y5 outsideGeofence = false",   r5.outsideGeofence  === false);
  check("Y5 distanceMeters < 100",      (r5.distanceMeters ?? 999) < 100, r5.distanceMeters);

  // ── Y6: checkGeofence — outside ───────────────────────────────────────────
  console.log("\nY6 – checkGeofence: outside radius → flagged");
  // Quezon City (~7 km away)
  const r6 = checkGeofence(14.6760, 121.0437, GEOFENCE);
  check("Y6 outsideGeofence = true",    r6.outsideGeofence  === true);
  check("Y6 distanceMeters > 100",      (r6.distanceMeters ?? 0) > 100, r6.distanceMeters);

  // ── Y7: executePunch — no selfie/GPS → succeeds ───────────────────────────
  console.log("\nY7 – executePunch: basic punch (no selfie/GPS) → creates AttendanceLog + DTRRecord");
  const punch7 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "IN",
    source:     "ESS",
  });
  check("Y7 ok = true",                 punch7.ok === true, punch7.ok ? "" : (punch7 as { code: string }).code);
  if (punch7.ok) {
    check("Y7 logId present",           Boolean(punch7.log.id));
    check("Y7 dtrId present",           Boolean(punch7.dtr.id));
    check("Y7 outsideGeofence = false", punch7.log.outsideGeofence === false);
  }

  // ── Y8: executePunch — GPS without consent → NO_CONSENT ──────────────────
  console.log("\nY8 – executePunch: GPS without consent → NO_CONSENT");
  const punch8 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "OUT",
    source:     "ESS",
    latitude:   14.5547,
    longitude:  121.0244,
  });
  check("Y8 ok = false",                punch8.ok === false);
  check("Y8 code = NO_CONSENT",         !punch8.ok && punch8.code === "NO_CONSENT");

  // ── Y9: executePunch — grant GEOLOCATION consent, then punch ─────────────
  console.log("\nY9 – executePunch: GEOLOCATION consent granted → punch succeeds");
  await db.consentRecord.create({
    data: {
      tenantId:      TENANT_ID,
      employeeId:    ROBERTO_ID,
      type:          "GEOLOCATION",
      granted:       true,
      policyVersion: "v2026-01",
    },
  });
  const punch9 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "OUT",
    source:     "ESS",
    latitude:   14.5547,
    longitude:  121.0244,
  });
  check("Y9 ok = true",                 punch9.ok === true, punch9.ok ? "" : (punch9 as { code: string }).code);
  if (punch9.ok) {
    // Punching at exact geofence centre → inside, but Roberto's branch has no geofence
    // so distanceMeters = null (no geofence configured → not flagged)
    check("Y9 outsideGeofence = false",            punch9.log.outsideGeofence === false);
    check("Y9 distanceMeters = null (no geofence)", punch9.log.distanceMeters === null);
  }

  // ── Y10: executePunch — selfie without BIOMETRIC consent → NO_CONSENT ─────
  console.log("\nY10 – executePunch: selfie without BIOMETRIC consent → NO_CONSENT");
  const punch10 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "IN",
    source:     "ESS",
    selfieKey:  "r2/selfies/smoke-test.jpg",
  });
  check("Y10 ok = false",               punch10.ok === false);
  check("Y10 code = NO_CONSENT",        !punch10.ok && punch10.code === "NO_CONSENT");

  // ── Y11: executePunch — grant BIOMETRIC_SELFIE, then punch ───────────────
  console.log("\nY11 – executePunch: BIOMETRIC_SELFIE consent granted → selfieKey stored");
  await db.consentRecord.create({
    data: {
      tenantId:      TENANT_ID,
      employeeId:    ROBERTO_ID,
      type:          "BIOMETRIC_SELFIE",
      granted:       true,
      policyVersion: "v2026-01",
    },
  });
  const punch11 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "IN",
    source:     "KIOSK",
    selfieKey:  "r2/selfies/smoke-y-11.jpg",
  });
  check("Y11 ok = true",                punch11.ok === true, punch11.ok ? "" : (punch11 as { code: string }).code);
  if (punch11.ok) {
    const log11 = await db.attendanceLog.findUnique({
      where: { id: punch11.log.id },
      select: { selfieKey: true },
    });
    check("Y11 selfieKey stored",       log11?.selfieKey === "r2/selfies/smoke-y-11.jpg");
  }

  // ── Y12: executePunch — DTR locked → DTR_LOCKED ───────────────────────────
  console.log("\nY12 – executePunch: DTR locked → DTR_LOCKED");
  // Lock the DTR record that was created/updated by Y7/Y9/Y11 (use DTR id from Y7)
  const dtrIdToLock = punch7.ok ? punch7.dtr.id : null;
  if (dtrIdToLock) {
    await db.dTRRecord.update({ where: { id: dtrIdToLock }, data: { isLocked: true } });
  }
  const punch12 = await executePunch({
    tenantId:   TENANT_ID,
    employeeId: ROBERTO_ID,
    punchType:  "OUT",
    source:     "ESS",
  });
  check("Y12 ok = false",               punch12.ok === false);
  check("Y12 code = DTR_LOCKED",        !punch12.ok && punch12.code === "DTR_LOCKED");
  // Unlock for cleanup
  if (dtrIdToLock) {
    await db.dTRRecord.update({ where: { id: dtrIdToLock }, data: { isLocked: false } });
  }

  // ── Y13: Kiosk creation ───────────────────────────────────────────────────
  console.log("\nY13 – Kiosk DB: create kiosk → deviceToken unique, isActive = true");
  const kiosk = await db.kiosk.create({
    data: {
      tenantId:      TENANT_ID,
      name:          "Smoke Kiosk Y",
      requiresSelfie: true,
      isActive:      true,
    },
  });
  check("Y13 kiosk id present",         Boolean(kiosk.id));
  check("Y13 deviceToken non-empty",    kiosk.deviceToken.length > 0, kiosk.deviceToken.slice(0, 12) + "…");
  check("Y13 isActive = true",          kiosk.isActive === true);

  // ── Y14: AttendanceLog count ──────────────────────────────────────────────
  console.log("\nY14 – AttendanceLog count = 4 smoke rows (Y7 + Y9 + Y11 + Y12)");
  const logCount = await db.attendanceLog.count({
    where: {
      tenantId:   TENANT_ID,
      employeeId: ROBERTO_ID,
      punchedAt:  { gte: todayMidnight, lt: tomorrowMidnight },
    },
  });
  // Y7 (IN, no GPS/selfie), Y9 (OUT with GPS), Y11 (IN with selfie), Y12 (OUT, locked DTR)
  // Y12 still writes the AttendanceLog (captured for audit) but skips the DTR update
  check("Y14 attendanceLog count = 4", logCount === 4, logCount);

  // ── Y15: NSD minutes ─────────────────────────────────────────────────────
  console.log("\nY15 – nsdMinutes: NSD punch 22:00–23:30 → 90 nsd minutes");
  const NSD_DATE = new Date("2026-06-02T00:00:00.000Z");
  const r15 = computeDtrFields(
    NSD_DATE,
    [
      { punchType: "IN",  punchedAt: new Date("2026-06-02T22:00:00.000Z") },
      { punchType: "OUT", punchedAt: new Date("2026-06-02T23:30:00.000Z") },
    ],
    null, // no shift (unscheduled)
  );
  check("Y15 workedMinutes = 90",       r15.workedMinutes === 90);
  check("Y15 nsdMinutes = 90",          r15.nsdMinutes    === 90, r15.nsdMinutes);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  const delLogs = await db.attendanceLog.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID,
      punchedAt: { gte: todayMidnight, lt: tomorrowMidnight } },
  });
  const delDtr = await db.dTRRecord.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID, date: todayMidnight },
  });
  const delConsent = await db.consentRecord.deleteMany({
    where: { tenantId: TENANT_ID, employeeId: ROBERTO_ID },
  });
  const delKiosk = await db.kiosk.deleteMany({
    where: { tenantId: TENANT_ID, name: "Smoke Kiosk Y" },
  });
  console.log(`  deleted ${delLogs.count} attendance logs`);
  console.log(`  deleted ${delDtr.count} DTR records`);
  console.log(`  deleted ${delConsent.count} consent records`);
  console.log(`  deleted ${delKiosk.count} kiosks`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  if (failures === 0) {
    console.log(`Phase Y smoke: ${total}/${total} PASS`);
  } else {
    console.error(`Phase Y smoke: ${total - failures}/${total} PASS — ${failures} FAIL`);
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
