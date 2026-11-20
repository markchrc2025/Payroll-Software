/**
 * PAY-170 part 2 (Mark, 17 Nov 2026: "First test the Attendance Logs, DTR,
 * DTR Approval, then Payroll Run"; Wave 4 ordered 20 Nov 2026). The whole
 * timekeeping chain, through the app's own code at each step, checked against
 * figures worked out by hand:
 *
 *   device file (ZKTeco ATTLOG .dat) -> import -> DTR per day
 *   -> the employee files overtime in ESS, HR approves it -> HR fixes the missing punch
 *   -> HR approves the cutoff's DTR -> payroll run reads the approved DTR.
 *
 * Employee: monthly 25,000.00, semi-monthly, Mon-Fri 08:00-17:00, 60 min
 * break, no grace, overtime suggested after 8 worked hours. Cutoff 1-15 Nov 2026 (10 workdays; 1 Nov is a Sunday).
 *   2 Nov  08:00-17:00              full day
 *   3 Nov  08:30-17:00              30 min late
 *   4 Nov  08:00-16:00              60 min undertime
 *   5 Nov  08:00-19:00              2 h overtime, filed and approved by HR
 *   6 Nov  no punches               absent
 *   9 Nov  08:00 in, no out         missing punch; HR enters 17:00, then approves
 *  10 Nov  08:00 to 12:00 break out, 13:00 break in, 17:00 out (break punches)
 *  11-13   08:00-17:00              full days
 *
 * Hand figures (centavos):
 *   daily rate   2,500,000 x 12 / 261 = 114,942 (floored)   hourly = 114,942 / 8 = 14,367.75 -> 14,368
 *   one unpaid day (LWOP equivalent) = 114,943 (half-up)
 *   base pay     1,250,000 - 114,943 = 1,135,057
 *   late + UT    90 min x 14,368 / 60 = 21,552
 *   OT           2 h x 14,368 x 1.25 = 35,920
 *   gross        1,135,057 - 21,552 + 35,920 = 1,149,425
 *   contributions (company default: first cutoff), on the 25,000 monthly basic:
 *                SSS 5% = 125,000; PhilHealth 5% / 2 = 62,500; Pag-IBIG 2% of 10,000 = 20,000
 *   taxable      1,149,425 - 207,500 = 941,925, under the 1,041,700 floor: tax 0
 *   net          1,149,425 - 207,500 - 0 = 941,925
 *
 *   C1  (T1) a ZKTeco ATTLOG .dat file (no header, tab separated, state in the
 *       4th column) imports; break punches (states 2 and 3) are skipped and
 *       counted, overtime punches (4 and 5) count as IN and OUT.
 *   C2  each day's DTR carries the late, undertime and suggested overtime;
 *       the absent day has no DTR; the day without an OUT is a missing punch.
 *   C3  the employee files the overtime in ESS and HR approves it, which puts
 *       it on the day's DTR; bulk approval skips the missing-punch day, and
 *       after HR's manual time-out it can be approved.
 *   C4  the payroll run reads the approved DTR (source DTR) and every figure
 *       matches the hand figures above.
 *   C5  the absent day is listed on the run (PAY-172) as 1 day without an
 *       approved DTR.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p17bt${sfx}`;
const id = (s: string) => `p17b${s}${sfx}`;
const E = id("emp");
const U = id("hr");
const SHIFT = id("shift");
const NUM = `77${parseInt(sfx, 16) % 100000}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({
  requirePermission: vi.fn(async () => ({ ctx: auth })),
  checkPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/approvals/second-party", () => ({ requireApprover: vi.fn(async () => ({ ctx: auth })) }));
vi.mock("@/lib/jobs/workers", () => ({ enqueueOtApproved: vi.fn(async () => undefined) }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { importPunches, parsePunchCsv } from "@/lib/attendance/import";
import { POST as bulkApprove } from "@/app/api/dtr/bulk-approve/route";
import { POST as approveDay } from "@/app/api/dtr/[id]/approve/route";
import { PATCH as manualTime } from "@/app/api/dtr/[id]/manual/route";
import { POST as fileOt } from "@/app/api/ess/ot-applications/route";
import { POST as approveOt } from "@/app/api/ot-applications/[id]/approve/route";
import { createDraftRun } from "@/lib/payroll/persist";

const NOW = new Date("2026-11-16T02:00:00.000Z");

// What a ZKTeco device writes to its USB stick (1_attlog.dat): user id
// (space padded), date and time, device, state (0 in, 1 out, 2 break out,
// 3 break in, 4 OT in, 5 OT out), verify mode, work code.
const line = (ymd: string, hms: string, state: number) => `     ${NUM}\t${ymd} ${hms}\t1\t${state}\t1\t0`;
const full = (d: string) => [line(d, "08:00:00", 0), line(d, "17:00:00", 1)];
const ATTLOG = [
  ...full("2026-11-02"),
  line("2026-11-03", "08:30:00", 0), line("2026-11-03", "17:00:00", 1),
  line("2026-11-04", "08:00:00", 0), line("2026-11-04", "16:00:00", 1),
  line("2026-11-05", "08:00:00", 0), line("2026-11-05", "19:00:00", 5),
  line("2026-11-09", "08:00:00", 0),
  line("2026-11-10", "08:00:00", 0), line("2026-11-10", "12:00:00", 2), line("2026-11-10", "13:00:00", 3), line("2026-11-10", "17:00:00", 1),
  ...full("2026-11-11"), ...full("2026-11-12"),
  line("2026-11-13", "08:00:00", 4), line("2026-11-13", "17:00:00", 1),
].join("\r\n") + "\r\n";

const req = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describeDb("PAY-170 full timekeeping chain: device file to payslip (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const dtr = async (day: string) =>
    (await q(
      `SELECT id, "lateMinutes" late, "undertimeMinutes" ut, "suggestedOtMinutes" sot, "otMinutes" ot,
              "hasMissingPunch" missing, "approvalStatus" st
         FROM "DTRRecord" WHERE "employeeId" = $1 AND date = $2::date`,
      [E, day],
    )).rows[0] as { id: string; late: number; ut: number; sot: number; ot: number; missing: boolean; st: string } | undefined;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    ess.tenantId = T;
    ess.employeeId = E;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P17B${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p17b-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'HR', now())`,
      [U, T, `hr-${sfx}@example.test`],
    );
    await q(
      `INSERT INTO "ShiftSchedule" (id, "tenantId", name, type, "timeIn", "timeOut", "gracePeriodMinutes", "breakMinutes", "breakPolicy", "workDays", "otThresholdMinutes", "updatedAt")
       VALUES ($1, $2, 'Day shift', 'FIXED', '08:00', '17:00', 0, 60, 'FIXED_DEDUCTION', '["MON","TUE","WED","THU","FRI"]'::jsonb, 480, now())`,
      [SHIFT, T],
    );
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "shiftScheduleId", "updatedAt")
       VALUES ($1, $2, $3, 'Rosa', 'Chain', '2025-01-06', $4, now())`,
      [E, T, NUM, SHIFT],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 2500000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const t of ["PayrollSheet", "PayrollBook", "OTApplication", "DTRAuditLog", "DTRRecord", "AttendanceLog", "AuditLog", "EmploymentTerm", "Employee", "ShiftSchedule", "StatutoryRule", "User"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("C1 (T1) a ZKTeco ATTLOG .dat file imports; break punches are skipped and counted", async () => {
    const parsed = parsePunchCsv(ATTLOG);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(19);
    expect(parsed.rows[0]).toEqual({ employeeNumber: NUM, punchedAt: "2026-11-02 08:00:00", punchType: "0" });
    const r = await importPunches(T, parsed.rows, NOW);
    expect(r).toEqual({ ok: true, imported: 17, duplicates: 0, breaksSkipped: 2, daysRecomputed: 9, employees: 1 });
    const kinds = (await q(`SELECT "punchType" t, count(*)::int n FROM "AttendanceLog" WHERE "employeeId" = $1 GROUP BY 1 ORDER BY 1`, [E])).rows;
    expect(kinds).toEqual([{ t: "IN", n: 9 }, { t: "OUT", n: 8 }]);
  });

  it("C2 each day's DTR carries late, undertime and suggested OT; the absent day has none; a missing OUT is flagged", async () => {
    expect(await dtr("2026-11-02")).toMatchObject({ late: 0, ut: 0, sot: 0, missing: false, st: "PENDING" });
    expect(await dtr("2026-11-03")).toMatchObject({ late: 30, ut: 0 });
    expect(await dtr("2026-11-04")).toMatchObject({ late: 0, ut: 60 });
    expect(await dtr("2026-11-05")).toMatchObject({ late: 0, ut: 0, sot: 120, ot: 0 });
    expect(await dtr("2026-11-06")).toBeUndefined();
    expect(await dtr("2026-11-09")).toMatchObject({ missing: true });
    expect(await dtr("2026-11-10")).toMatchObject({ late: 0, ut: 0, missing: false });
    expect(await dtr("2026-11-13")).toMatchObject({ late: 0, ut: 0, missing: false });
  });

  it("C3 HR approves OT, fixes the missing punch, and approves the cutoff", async () => {
    // ESS takes overtime filed within 7 days, so the employee files it on 6 Nov.
    vi.setSystemTime(new Date("2026-11-06T02:00:00.000Z"));
    const filed = await fileOt(req("/api/ess/ot-applications", { date: "2026-11-05", hours: 2, justification: "Month-end inventory count" }));
    expect(filed.status).toBe(200);
    const ot = (await filed.json()).data as { id: string };
    vi.setSystemTime(NOW);
    const okOt = await approveOt(req(`/api/ot-applications/${ot.id}/approve`), { params: Promise.resolve({ id: ot.id }) });
    expect(okOt.status).toBe(200);
    expect((await dtr("2026-11-05"))!.ot).toBe(120);

    const bulk = await bulkApprove(req("/api/dtr/bulk-approve", { from: "2026-11-01", to: "2026-11-15" }));
    expect(bulk.status).toBe(200);
    const b = (await bulk.json()).data as { approved: number; skippedMissingPunch: { date: string }[] };
    expect(b.approved).toBe(8);
    expect(b.skippedMissingPunch.map((s) => s.date)).toEqual(["2026-11-09"]);

    const day9 = (await dtr("2026-11-09"))!;
    const fix = await manualTime(
      req(`/api/dtr/${day9.id}/manual`, { field: "manualTimeOut", value: "2026-11-09T17:00:00+08:00", reasonCode: "FORGOT_CLOCK_OUT" }, "PATCH"),
      { params: Promise.resolve({ id: day9.id }) },
    );
    expect(fix.status).toBe(200);
    expect(await dtr("2026-11-09")).toMatchObject({ missing: false, late: 0, ut: 0 });
    const ok9 = await approveDay(req(`/api/dtr/${day9.id}/approve`), { params: Promise.resolve({ id: day9.id }) });
    expect(ok9.status).toBe(200);
    const pending = (await q(`SELECT count(*)::int n FROM "DTRRecord" WHERE "employeeId" = $1 AND "approvalStatus" <> 'APPROVED'`, [E])).rows[0].n;
    expect(pending).toBe(0);
  });

  it("C4 the payroll run reads the approved DTR and matches the hand figures", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-15T00:00:00Z"),
      cycle: "SEMI_MONTHLY", createdByUserId: U,
    });
    const s = (await q(
      `SELECT "basePayCents"::text base, "lateUndertimeDeductionCents"::text late, "otPayCents"::text ot,
              "grossTaxableIncomeCents"::text taxable, "withholdingTaxCents"::text tax, "netPayCents"::text net,
              "sssEeCents"::text sss, "philhealthEeCents"::text phic, "pagibigEeCents"::text hdmf,
              "periodInputSnapshot" pi
         FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [book.id, E],
    )).rows[0];
    expect(s.pi).toMatchObject({ attendanceSource: "DTR", unpaidLeaveDays: 1, lateUndertimeMinutes: 90 });
    expect(Number(s.pi.regularOtHours)).toBe(2);
    expect({ base: s.base, late: s.late, ot: s.ot, sss: s.sss, phic: s.phic, hdmf: s.hdmf }).toEqual({
      base: "1135057", late: "21552", ot: "35920", sss: "125000", phic: "62500", hdmf: "20000",
    });
    expect(s.taxable).toBe("941925");
    expect(s.tax).toBe("0");
    expect(s.net).toBe("941925");

    const gaps = (await q(`SELECT "dtrGaps" g FROM "PayrollBook" WHERE id = $1`, [book.id])).rows[0].g;
    expect(gaps).toEqual([{ employeeId: E, days: 1, held: false }]);
  });

  it("C5 the import dialog takes a .dat file and reports skipped break punches", () => {
    const src = readFileSync("src/components/attendance/ImportPunchesDialog.tsx", "utf8");
    expect(src).toMatch(/accept="[^"]*\.dat/);
    expect(src).toMatch(/breaksSkipped/);
  });
});
