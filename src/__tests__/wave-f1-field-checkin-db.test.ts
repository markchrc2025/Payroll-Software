/**
 * Wave F1 (PAY-216, decision 10) against real Postgres: field check-in.
 *
 *   D1  a field worker's punch inside a client site's fence is not flagged
 *       and names the site (fails on main: no siteName on the punch).
 *   D2  outside every fence: accepted, flagged with the distance to the
 *       nearest, and still reaches the DTR.
 *   D3  field work set on the job type counts; an office worker's punch is
 *       checked only against their branch fence, as before.
 *   D4  the supervisors' list shows field punches, flagged ones on request.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wft${sfx}`;
const id = (k: string) => `wf${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { executePunch } from "@/lib/attendance/punch";
import { GET as list } from "@/app/api/attendance/field-checkins/route";

const SELFIE = Buffer.from("selfie").toString("base64");
// Client site in Ortigas; the branch in Marikina, about 6 km away.
const SITE = { lat: 14.5869, lon: 121.0614 };
const BRANCH = { lat: 14.6507, lon: 121.1029 };

describeDb("Wave F1 field check-in (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const punch = (emp: string, lat: number, lon: number) => executePunch({
    tenantId: T, employeeId: emp, punchType: "IN", source: "ESS", latitude: lat, longitude: lon,
    selfieKey: null, selfieData: new Uint8Array(Buffer.from(SELFIE, "base64")),
  } as Parameters<typeof executePunch>[0]);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WF${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Branch" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Marikina', now())`, [id("br"), T]);
    await q(`INSERT INTO "JobType" (id, "tenantId", name, "fieldWork", "updatedAt") VALUES ($1, $2, 'Field technician', true, now())`, [id("jt"), T]);
    for (const [e, num, field, jt] of [[id("ana"), "A-1", true, null], [id("ben"), "B-1", false, id("jt")], [id("cara"), "C-1", false, null]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "branchId", "fieldWork", "jobTypeId", "updatedAt") VALUES ($1, $2, $3, 'X', $3, '2024-01-08', $4, $5, $6, now())`, [e, T, num, id("br"), field, jt]);
      await q(`INSERT INTO "ConsentRecord" (id, "tenantId", "employeeId", type, granted, "policyVersion") VALUES ($1, $2, $3, 'GEOLOCATION', true, 'v1'), ($4, $2, $3, 'BIOMETRIC_SELFIE', true, 'v1')`, [`${e}g`, T, e, `${e}s`]);
    }
    await q(`INSERT INTO "Geofence" (id, "tenantId", "branchId", name, latitude, longitude, "radiusMeters", "updatedAt") VALUES ($1, $2, $3, 'Marikina office', $4, $5, 100, now()), ($6, $2, NULL, 'Client: Ortigas tower', $7, $8, 150, now())`,
      [id("gb"), T, id("br"), BRANCH.lat, BRANCH.lon, id("gs"), SITE.lat, SITE.lon]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["DTRRecord", "AttendanceLog", "ConsentRecord", "Geofence"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    for (const t of ["JobType", "Branch"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 inside a client site's fence", async () => {
    const r = await punch(id("ana"), SITE.lat + 0.0005, SITE.lon);
    expect(r).toMatchObject({ ok: true, log: { outsideGeofence: false, siteName: "Client: Ortigas tower" } });
  });

  it("D2 outside every fence: accepted, flagged, in the DTR", async () => {
    const r = await punch(id("ana"), 14.5547, 121.0244); // Makati
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.log.outsideGeofence).toBe(true);
    expect(r.log.siteName).toBeNull();
    expect(r.log.distanceMeters).toBeGreaterThan(4000);
    expect((await q(`SELECT count(*)::int n FROM "DTRRecord" WHERE id = $1`, [r.dtr.id])).rows[0].n).toBe(1);
  });

  it("D3 the job type counts; office staff check their branch only", async () => {
    const ben = await punch(id("ben"), SITE.lat, SITE.lon);
    expect(ben).toMatchObject({ ok: true, log: { outsideGeofence: false, siteName: "Client: Ortigas tower" } });
    const cara = await punch(id("cara"), SITE.lat, SITE.lon);
    expect(cara).toMatchObject({ ok: true, log: { outsideGeofence: true, siteName: null } });
  });

  it("D4 the supervisors' list", async () => {
    const d = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    const all = (await (await list(new NextRequest(`http://x/api/attendance/field-checkins?from=${d}&to=${d}`))).json()).data as { employee: { employeeNumber: string }; outsideGeofence: boolean }[];
    expect(all.map((r) => r.employee.employeeNumber).sort()).toEqual(["A-1", "A-1", "B-1"]);
    const flagged = (await (await list(new NextRequest(`http://x/api/attendance/field-checkins?from=${d}&to=${d}&flagged=1`))).json()).data as unknown[];
    expect(flagged).toHaveLength(1);
  });
});
