/**
 * PAY-170 (Mark, 17 Nov 2026 22:03 and 23:20): attendance must come in as
 * punches, so the timekeeping chain (punches, DTR, approval, payroll) can be
 * tested and used. Every punch used to be stamped "now"; past punches could
 * not be loaded.
 *
 *   I1  (T1) imported punches are stored (source IMPORT) at the right instant
 *       (Manila time read as Manila time), and each day's DTR is worked out
 *       exactly as a live punch would work it out (computeDtrFields).
 *   I2  all or nothing: one wrong row (unknown employee, bad type, bad time,
 *       future time) and nothing is written; every problem has its row.
 *   I3  importing the same punches again writes nothing new.
 *   I4  a day whose DTR is approved or locked is refused.
 *   I5  CSV: header aliases and device words (C/In, C/Out) are understood.
 *   I6  the Attendance Logs date filter is in company time; the page has the
 *       import button; the QA connector imports through the same API.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { importPunches, parsePunchCsv, punchInstant, punchTypeOf } from "@/lib/attendance/import";
import { computeDtrFields } from "@/lib/attendance/compute-dtr";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p170t${sfx}`;
const id = (s: string) => `p170${s}${sfx}`;
const A = id("a");
const NUM = `P170-${sfx}`;
const SHIFT = id("s");

/** Manila wall clock to UTC (Manila is UTC+8 all year). */
const mnl = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+08:00`);

describeDb("PAY-170 attendance import (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  async function dtr(day: string) {
    const r = await q(
      `SELECT "workedMinutes", "lateMinutes", "undertimeMinutes", "dayStatus", "hasMissingPunch", "approvalStatus"
         FROM "DTRRecord" WHERE "employeeId" = $1 AND date = $2::date`,
      [A, day],
    );
    return r.rows[0];
  }
  const logCount = async () => Number((await q(`SELECT count(*) FROM "AttendanceLog" WHERE "employeeId" = $1`, [A])).rows[0].count);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P170${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "ShiftSchedule" (id, "tenantId", name, type, "timeIn", "timeOut", "gracePeriodMinutes", "breakMinutes", "breakPolicy", "workDays", "updatedAt")
       VALUES ($1, $2, 'Day 8-5', 'FIXED', '08:00', '17:00', 0, 60, 'FIXED_DEDUCTION', '["MON","TUE","WED","THU","FRI"]'::jsonb, now())`,
      [SHIFT, T],
    );
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "shiftScheduleId", "updatedAt")
       VALUES ($1, $2, $3, 'P170', 'Test', '2025-01-06', $4, now())`,
      [A, T, NUM, SHIFT],
    );
  });

  afterAll(async () => {
    for (const t of ["OTApplication", "DTRRecord", "AttendanceLog", "AuditLog"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "ShiftSchedule" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("I1 (T1) punches stored at the right instant; the DTR is worked out as for a live punch", async () => {
    const rows = [
      { employeeNumber: NUM, punchedAt: "2026-11-02 08:15", punchType: "IN" },  // 15 min late
      { employeeNumber: NUM, punchedAt: "2026-11-02 17:00", punchType: "OUT" },
      { employeeNumber: NUM, punchedAt: "2026-11-03 07:50", punchType: "IN" },  // on time, leaves early
      { employeeNumber: NUM, punchedAt: "2026-11-03 16:30", punchType: "OUT" },
    ];
    const r = await importPunches(T, rows, new Date("2026-11-10T00:00:00Z"));
    expect(r).toEqual({ ok: true, imported: 4, duplicates: 0, daysRecomputed: 2, employees: 1 });

    // The column holds UTC without a zone; read it as text so the test does
    // not depend on the machine's time zone.
    const logs = await q(
      `SELECT to_char("punchedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at, "punchType", source
         FROM "AttendanceLog" WHERE "employeeId" = $1 ORDER BY "punchedAt"`,
      [A],
    );
    expect(logs.rows.map((l) => [l.at, l.punchType, l.source])).toEqual([
      [mnl("2026-11-02", "08:15").toISOString(), "IN", "IMPORT"],
      [mnl("2026-11-02", "17:00").toISOString(), "OUT", "IMPORT"],
      [mnl("2026-11-03", "07:50").toISOString(), "IN", "IMPORT"],
      [mnl("2026-11-03", "16:30").toISOString(), "OUT", "IMPORT"],
    ]);

    const shiftCtx = {
      timeIn: "08:00", timeOut: "17:00", coreTimeIn: null, coreTimeOut: null, requiredHours: null,
      gracePeriodMinutes: 0, breakMinutes: 60, breakPolicy: "FIXED_DEDUCTION" as const, crossesMidnight: false,
      otThresholdMinutes: null, breakDeductAfterMinutes: 300,
    };
    const nsd = { startMin: 22 * 60, endMin: 6 * 60 };
    for (const [day, i, o] of [["2026-11-02", "08:15", "17:00"], ["2026-11-03", "07:50", "16:30"]]) {
      const expected = computeDtrFields(
        new Date(`${day}T00:00:00.000Z`),
        [{ punchType: "IN", punchedAt: mnl(day, i) }, { punchType: "OUT", punchedAt: mnl(day, o) }],
        shiftCtx, nsd, "Asia/Manila",
      );
      const got = await dtr(day);
      expect(got.workedMinutes, day).toBe(expected.workedMinutes);
      expect(got.lateMinutes, day).toBe(expected.lateMinutes);
      expect(got.undertimeMinutes, day).toBe(expected.undertimeMinutes);
      expect(got.approvalStatus).toBe("PENDING");
    }
    // The figures themselves: 15 minutes late on the 2nd, 30 minutes undertime on the 3rd.
    expect((await dtr("2026-11-02")).lateMinutes).toBe(15);
    expect((await dtr("2026-11-03")).undertimeMinutes).toBe(30);
  });

  it("I2 one wrong row and nothing is written; every problem has its row", async () => {
    const before = await logCount();
    const r = await importPunches(T, [
      { employeeNumber: NUM, punchedAt: "2026-11-04 08:00", punchType: "IN" },
      { employeeNumber: "NOBODY", punchedAt: "2026-11-04 08:00", punchType: "IN" },
      { employeeNumber: NUM, punchedAt: "2026-11-04 17:00", punchType: "LUNCH" },
      { employeeNumber: NUM, punchedAt: "04/11/2026 5pm", punchType: "OUT" },
      { employeeNumber: NUM, punchedAt: "2026-12-25 08:00", punchType: "IN" },
    ], new Date("2026-11-10T00:00:00Z"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.map((p) => p.row)).toEqual([2, 3, 4, 5]);
    expect(r.problems[0].message).toMatch(/No employee numbered "NOBODY"/);
    expect(r.problems[3].message).toMatch(/future/);
    expect(await logCount()).toBe(before);
    expect(await dtr("2026-11-04")).toBeUndefined();
  });

  it("I3 importing the same punches again writes nothing new", async () => {
    const before = await logCount();
    const r = await importPunches(T, [
      { employeeNumber: NUM, punchedAt: "2026-11-02 08:15", punchType: "IN" },
      { employeeNumber: NUM, punchedAt: "2026-11-02 17:00", punchType: "OUT" },
    ], new Date("2026-11-10T00:00:00Z"));
    expect(r).toEqual({ ok: true, imported: 0, duplicates: 2, daysRecomputed: 0, employees: 0 });
    expect(await logCount()).toBe(before);
  });

  it("I4 an approved or locked day is refused", async () => {
    await q(`UPDATE "DTRRecord" SET "approvalStatus" = 'APPROVED' WHERE "employeeId" = $1 AND date = '2026-11-02'`, [A]);
    await q(`UPDATE "DTRRecord" SET "isLocked" = true WHERE "employeeId" = $1 AND date = '2026-11-03'`, [A]);
    const r = await importPunches(T, [
      { employeeNumber: NUM, punchedAt: "2026-11-02 12:00", punchType: "OUT" },
      { employeeNumber: NUM, punchedAt: "2026-11-03 12:00", punchType: "OUT" },
    ], new Date("2026-11-10T00:00:00Z"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.map((p) => p.message).sort()).toEqual([
      `${NUM} on 2026-11-02: the DTR is already approved, so its punches cannot be changed.`,
      `${NUM} on 2026-11-03: the DTR is locked (its payroll is finalized), so its punches cannot be changed.`,
    ]);
  });

  it("I5 CSV header aliases, device words and Manila time", () => {
    const { rows, problems } = parsePunchCsv('﻿AC-No.,Date/Time,State\r\n"EMP-1",2026-11-02 08:05:30,C/In\r\nEMP-1,2026-11-02 17:01,C/Out\r\n');
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { employeeNumber: "EMP-1", punchedAt: "2026-11-02 08:05:30", punchType: "C/In" },
      { employeeNumber: "EMP-1", punchedAt: "2026-11-02 17:01", punchType: "C/Out" },
    ]);
    expect(punchTypeOf("C/In")).toBe("IN");
    expect(punchTypeOf("check out")).toBe("OUT");
    expect(punchTypeOf("break")).toBeNull();
    expect(punchInstant("2026-11-02 08:05:30", "Asia/Manila")!.toISOString()).toBe("2026-11-02T00:05:30.000Z");
    expect(punchInstant("2026-11-02T08:05:00+08:00", "UTC")!.toISOString()).toBe("2026-11-02T00:05:00.000Z");
    expect(punchInstant("2026-02-30 08:00", "Asia/Manila")).toBeNull();
    expect(parsePunchCsv("name,when\nx,y").problems[0].message).toMatch(/header must name/);
  });

  it("I6 company-time date filter, the import button, and the QA connector", () => {
    const logs = readFileSync("src/app/api/attendance-logs/route.ts", "utf8");
    expect(logs).toContain('atLocalWallClock(new Date(ymd + "T00:00:00.000Z"), "00:00", tz)');
    expect(logs).not.toContain('new Date(dateFrom + "T00:00:00.000Z")');
    const tab = readFileSync("src/components/attendance/AttendanceLogsTab.tsx", "utf8");
    expect(tab).toContain("<ImportPunchesDialog onImported={fetchData} />");
    const mcp = readFileSync("scripts/staging/qa-mcp.mjs", "utf8");
    expect(mcp).toContain('api.must("POST", "/api/attendance-logs/import", { rows: a.rows })');
    const route = readFileSync("src/app/api/attendance-logs/import/route.ts", "utf8");
    expect(route).toContain('requirePermission(req, "TIMESHEETS", "UPDATE")');
  });
});
