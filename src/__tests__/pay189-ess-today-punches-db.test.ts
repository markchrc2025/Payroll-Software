/**
 * PAY-189 (found 18 Nov 2026 reading the ESS home screen): "today's punches"
 * were a UTC day chosen by the browser. In Manila a clock-in before 8:00 AM is
 * the previous UTC day, so at 8:05 AM the home screen said "Not clocked in"
 * and offered Clock In again.
 *
 *   K1  (T1) with no date, today is the employee's local day: a 07:50 Manila
 *       clock-in shows at 08:05 Manila.
 *   K2  a given date is a local day: 00:30 and 23:30 Manila on 18 Nov are both
 *       18 Nov; 19 Nov 00:10 is not.
 *   K3  the ESS screens ask the server for today (no browser-made date).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p189t${sfx}`;
const id = (s: string) => `p189${s}${sfx}`;
const A = id("a");

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { GET as todayPunches } from "@/app/api/ess/clock/route";

const mnl = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+08:00`);

describeDb("PAY-189 ESS today's punches use the local day (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const get = async (qs = "") =>
    ((await (await todayPunches(new NextRequest(`http://test.local/api/ess/clock${qs}`))).json()).data as { id: string }[]).map((x) => x.id);
  const punch = (key: string, type: string, at: Date) =>
    q(
      `INSERT INTO "AttendanceLog" (id, "tenantId", "employeeId", "punchType", "punchedAt", source)
       VALUES ($1, $2, $3, $4, $5::timestamptz AT TIME ZONE 'UTC', 'ESS')`,
      [id(key), T, A, type, at.toISOString()],
    );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    ess.employeeId = A;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P189${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P189', 'Test', '2025-01-06', now())`,
      [A, T, `P189-${sfx}`],
    );
    await punch("in", "IN", mnl("2026-11-18", "07:50"));
    await punch("early", "IN", mnl("2026-11-18", "00:30"));
    await punch("late", "OUT", mnl("2026-11-18", "23:30"));
    await punch("next", "IN", mnl("2026-11-19", "00:10"));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "AttendanceLog" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("K1 (T1) at 08:05 Manila, today includes the 07:50 clock-in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(mnl("2026-11-18", "08:05"));
    const ids = await get();
    vi.useRealTimers();
    expect(ids).toContain(id("in"));
    expect(ids).not.toContain(id("next"));
  });

  it("K2 a given date is the local day", async () => {
    expect((await get("?date=2026-11-18")).sort()).toEqual([id("early"), id("in"), id("late")].sort());
    expect(await get("?date=2026-11-19")).toEqual([id("next")]);
  });

  it("K3 the ESS screens ask the server for today", () => {
    for (const f of ["src/components/ess/screens.tsx", "src/components/ess/desktop-screens.tsx", "src/app/(ess)/ess/clock/page.tsx"])
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\/api\/ess\/clock\?date=\$\{today\}/);
  });
});
