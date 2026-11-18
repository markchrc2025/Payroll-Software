/**
 * PAY-176 (staging chain test, 17 Nov 2026): fixing a missing time-out on a
 * punch-based DTR left the day at 0 worked minutes with the missing-punch flag
 * still on. The override only read officialTimeIn/Out, which punches never
 * fill, so the day's real IN punch was ignored.
 *
 *   M1  (T1) a manual time-out on a day with only an IN punch recomputes the
 *       day from the real IN punch: worked, late and undertime are right and
 *       the missing-punch flag is cleared.
 *   M2  a manual time-in on a day with both punches replaces only the IN side;
 *       the real OUT punch is kept (lateness changes, undertime does not).
 *   M3  clearing the manual time-out puts the day back to its missing-punch
 *       state.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p176t${sfx}`;
const id = (s: string) => `p176${s}${sfx}`;
const A = id("a");
const SHIFT = id("s");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p176-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));

import { PATCH as patchManual } from "@/app/api/dtr/[id]/manual/route";

/** Manila wall clock to UTC (Manila is UTC+8 all year). */
const mnl = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+08:00`);

describeDb("PAY-176 manual time override recomputes from the day's punches (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  async function dtr(dtrId: string) {
    const r = await q(
      `SELECT "workedMinutes", "lateMinutes", "undertimeMinutes", "dayStatus", "hasMissingPunch"
         FROM "DTRRecord" WHERE id = $1`,
      [dtrId],
    );
    return r.rows[0];
  }
  async function day(dtrId: string, ymd: string, punches: Array<["IN" | "OUT", string]>, missing: boolean) {
    await q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "shiftScheduleId", "dayStatus", "workedMinutes", "hasMissingPunch", "updatedAt")
       VALUES ($1, $2, $3, $4::date, $5, 'PRESENT', 0, $6, now())`,
      [dtrId, T, A, ymd, SHIFT, missing],
    );
    for (const [type, hm] of punches) {
      await q(
        `INSERT INTO "AttendanceLog" (id, "tenantId", "employeeId", "punchType", "punchedAt", source)
         VALUES ($1, $2, $3, $4, $5::timestamptz AT TIME ZONE 'UTC', 'IMPORT')`,
        [id(`l${dtrId}${type}`), T, A, type, mnl(ymd, hm).toISOString()],
      );
    }
  }
  const patch = (dtrId: string, body: unknown) =>
    patchManual(
      new NextRequest(`http://test.local/api/dtr/${dtrId}/manual`, { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: dtrId }) },
    );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P176${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "ShiftSchedule" (id, "tenantId", name, type, "timeIn", "timeOut", "gracePeriodMinutes", "breakMinutes", "breakPolicy", "workDays", "updatedAt")
       VALUES ($1, $2, 'Day 8-5', 'FIXED', '08:00', '17:00', 0, 60, 'FIXED_DEDUCTION', '["MON","TUE","WED","THU","FRI"]'::jsonb, now())`,
      [SHIFT, T],
    );
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "shiftScheduleId", "updatedAt")
       VALUES ($1, $2, $3, 'P176', 'Test', '2025-01-06', $4, now())`,
      [A, T, `P176-${sfx}`, SHIFT],
    );
  });

  afterAll(async () => {
    for (const t of ["DTRAuditLog", "DTRRecord", "AttendanceLog"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "ShiftSchedule" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("M1 (T1) a manual time-out on an IN-only day recomputes from the real IN punch and clears the flag", async () => {
    const D = id("d1");
    await day(D, "2026-11-02", [["IN", "08:10"]], true); // 10 minutes late, forgot to clock out
    const res = await patch(D, { field: "manualTimeOut", value: mnl("2026-11-02", "17:00").toISOString(), reasonCode: "FORGOT_CLOCK_OUT" });
    expect(res.status).toBe(200);
    const r = await dtr(D);
    // 08:10 to 17:00 is 530 minutes less the 60-minute break.
    expect(r.workedMinutes).toBe(470);
    expect(r.lateMinutes).toBe(10);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.hasMissingPunch).toBe(false);
    expect(r.dayStatus).toBe("PRESENT");
  });

  it("M2 a manual time-in replaces only the IN side; the real OUT punch is kept", async () => {
    const D = id("d2");
    await day(D, "2026-11-03", [["IN", "08:30"], ["OUT", "16:30"]], false);
    const res = await patch(D, { field: "manualTimeIn", value: mnl("2026-11-03", "08:00").toISOString(), reasonCode: "GPS_FAILURE" });
    expect(res.status).toBe(200);
    const r = await dtr(D);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(30);
    expect(r.workedMinutes).toBe(450);
    expect(r.hasMissingPunch).toBe(false);
  });

  it("M3 clearing the manual time-out puts the day back to missing", async () => {
    const D = id("d1");
    const res = await patch(D, { field: "manualTimeOut", value: null, reasonCode: "FORGOT_CLOCK_OUT" });
    expect(res.status).toBe(200);
    const r = await dtr(D);
    expect(r.workedMinutes).toBe(0);
    expect(r.hasMissingPunch).toBe(true);
  });
});
