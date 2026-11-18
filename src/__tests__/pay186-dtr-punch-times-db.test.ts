/**
 * PAY-186 (ESS sandbox test, 18 Nov 2026): ESS My DTR showed "— → —" for a
 * day the employee had clocked in and out. Punches never filled the DTR's
 * time columns (officialTimeIn/Out, effectiveTimeIn/Out), which every screen
 * reads.
 *
 *   P1  (T1) recording punches fills the day's times: first IN, last OUT.
 *   P2  ESS My DTR returns those times for the day.
 *   P3  a supervisor's manual time-out still wins for the effective time when
 *       the day is worked out again.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { importPunches } from "@/lib/attendance/import";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p186t${sfx}`;
const id = (s: string) => `p186${s}${sfx}`;
const A = id("a");
const NUM = `P186-${sfx}`;

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { GET as myDtr } from "@/app/api/ess/dtr/route";

const mnl = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+08:00`);
const NOW = new Date("2026-11-10T00:00:00Z");

describeDb("PAY-186 a DTR day carries its punch times (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const times = async (day: string) =>
    (await q(
      `SELECT to_char("officialTimeIn", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') oi, to_char("officialTimeOut", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') oo,
              to_char("effectiveTimeIn", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ei, to_char("effectiveTimeOut", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') eo
         FROM "DTRRecord" WHERE "employeeId" = $1 AND date = $2::date`,
      [A, day],
    )).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    ess.employeeId = A;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P186${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P186', 'Test', '2025-01-06', now())`,
      [A, T, NUM],
    );
  });

  afterAll(async () => {
    for (const t of ["DTRRecord", "AttendanceLog", "AuditLog"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("P1 (T1) punches fill the day's times: first IN, last OUT", async () => {
    const r = await importPunches(T, [
      { employeeNumber: NUM, punchedAt: "2026-11-03 08:05", punchType: "IN" },
      { employeeNumber: NUM, punchedAt: "2026-11-03 12:00", punchType: "OUT" },
      { employeeNumber: NUM, punchedAt: "2026-11-03 13:00", punchType: "IN" },
      { employeeNumber: NUM, punchedAt: "2026-11-03 17:10", punchType: "OUT" },
    ], NOW);
    expect(r.ok).toBe(true);
    expect(await times("2026-11-03")).toEqual({
      oi: mnl("2026-11-03", "08:05").toISOString(), oo: mnl("2026-11-03", "17:10").toISOString(),
      ei: mnl("2026-11-03", "08:05").toISOString(), eo: mnl("2026-11-03", "17:10").toISOString(),
    });
  });

  it("P2 ESS My DTR returns the times", async () => {
    const res = await myDtr(new NextRequest("http://test.local/api/ess/dtr?limit=12"));
    const body = await res.json();
    const recs = (body.data as Array<{ records: Array<{ date: string; timeIn: string | null; timeOut: string | null }> }>)
      .flatMap((p) => p.records);
    const d = recs.find((x) => x.date.startsWith("2026-11-03"))!;
    expect([d.timeIn, d.timeOut]).toEqual([mnl("2026-11-03", "08:05").toISOString(), mnl("2026-11-03", "17:10").toISOString()]);
  });

  it("P3 a manual time-out still wins for the effective time", async () => {
    await q(`UPDATE "DTRRecord" SET "manualTimeOut" = $3 WHERE "employeeId" = $1 AND date = $2::date`,
      [A, "2026-11-03", mnl("2026-11-03", "18:00").toISOString()]);
    // Another punch that day makes the day be worked out again.
    await importPunches(T, [{ employeeNumber: NUM, punchedAt: "2026-11-03 17:30", punchType: "OUT" }], NOW);
    const t = await times("2026-11-03");
    expect(t.oo).toBe(mnl("2026-11-03", "17:30").toISOString());
    expect(t.eo).toBe(mnl("2026-11-03", "18:00").toISOString());
  });
});
