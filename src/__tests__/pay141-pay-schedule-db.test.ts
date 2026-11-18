/**
 * PAY-141 on a real Postgres, through the real route handlers.
 *
 *   R1  Settings: saving Mark's schedule (26th to 10th for the 15th, 11th to
 *       25th for the 30th) works and is audited; a schedule with a gap is
 *       refused with a plain message; the database refuses a weekly row and
 *       a monthly row with a second payday.
 *   R2  Paydays: the 15 Nov payday (a Sunday) is paid Saturday 14 Nov; the
 *       30 Nov payday (Bonifacio Day, a company holiday) is paid Saturday
 *       28 Nov; each lists its pay period and cutoff.
 *   R3  New run by payday: the server fills the dates (period 1 to 15 Nov,
 *       pay date 14 Nov, cutoff 26 Oct to 10 Nov); the run reads attendance
 *       for the CUTOFF window, not the pay period.
 *   R4  The payday list then shows that payday's run.
 *   R5  Refusals: a date that is not a payday, a payday with different
 *       dates, a payday on an off-cycle run, a regular run with neither.
 *   R6  A regular run given dates (older callers) still works, with no pay
 *       date or cutoff (attendance for its own period, as before).
 *   R7  (static) the New Run screen sends only the payday for a regular run
 *       and shows the dates read-only.
 *   R8  ruling 2a (Mark, 16 Nov): a monthly employee hired Monday 9 Nov, on
 *       the 15 Nov payday (cutoff 26 Oct to 10 Nov), is paid the 5 workdays
 *       employed in the pay period (9 to 13 Nov), not only the 2 days the
 *       cutoff saw; no day falls between two runs.
 *   R9  ruling 3a (PAY-142): the run reads APPROVED DTR for its cutoff when
 *       the window has any (it wins over a typed run input); with none it
 *       uses the typed input; with neither, nothing. The sheet records which.
 *   R10 a company that requires an approved DTR submission and has none for
 *       the window: the run does not use the unapproved DTR; it uses the
 *       typed input and records DTR_NOT_APPROVED.
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
const T = `p141t${sfx}`;
const id = (s: string) => `p141${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p141-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));
vi.mock("@/lib/jobs/workers", () => ({ enqueuePayrollRun: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.9" }));

import { writeAuditLog } from "@/lib/audit";
import { POST as createRun } from "@/app/api/payroll/runs/route";
import { GET as listPaydays } from "@/app/api/payroll/paydays/route";
import { GET as getSchedules, PUT as putSchedule } from "@/app/api/settings/pay-schedules/route";
import { processRun, recomputeRun } from "@/lib/payroll/persist";

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://test.local${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

describeDb("PAY-141 pay schedules, paydays and cutoffs (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let A = "";
  let B = "";

  beforeAll(async () => {
    // "Today" for the paydays list: Monday 16 Nov 2026. Only Date is faked.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P141${sfx}`.toUpperCase()]);
    const rules: [string, unknown][] = [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ];
    for (const [cat, payload] of rules) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p141-${cat}`, JSON.stringify(payload)],
      );
    }
    A = id("a");
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $1, 'P141', $1, '2025-01-06', now())`,
      [A, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 2500000, 'MONTHLY', now())`,
      [`${A}-t`, T, A],
    );
    // Attendance: one unpaid day in the CUTOFF window, none in the pay period.
    for (const [start, end, unpaid] of [["2026-10-26", "2026-11-10", 1], ["2026-11-01", "2026-11-15", 0]] as const) {
      await q(
        `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd", "unpaidLeaveDays", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [`${A}-${start}`, T, A, `${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`, unpaid],
      );
    }
    // B: monthly ₱28,000, hired Monday 9 Nov, no run input of any kind.
    B = id("b");
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $1, 'P141', $1, '2026-11-09', now())`,
      [B, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2026-11-09', 2800000, 'MONTHLY', now())`,
      [`${B}-t`, T, B],
    );
    await q(
      `INSERT INTO "Holiday" (id, "tenantId", name, category, date, "updatedAt")
       VALUES ($1, $2, 'Bonifacio Day', 'LEGAL', '2026-11-30', now())`,
      [id("hol"), T],
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["PaySchedule", "Holiday", "PeriodInput", "DTRRecord", "DTRApprovalConfig", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  const MARK = [
    { payDay: 30, cutoffStartDay: 11, cutoffEndDay: 25 }, // given out of order on purpose
    { payDay: 15, cutoffStartDay: 26, cutoffEndDay: 10 },
  ];

  it("R1 saves Mark's schedule, refuses a gap, and the database refuses bad rows", async () => {
    const before = await (await getSchedules(req("/api/settings/pay-schedules"))).json();
    expect(before.data.schedules.find((s: { cycle: string }) => s.cycle === "SEMI_MONTHLY").isDefault).toBe(true);

    const res = await putSchedule(req("/api/settings/pay-schedules", "PUT", { cycle: "SEMI_MONTHLY", slots: MARK }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.slots.map((s: { payDay: number }) => s.payDay)).toEqual([15, 30]); // payday order
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(expect.objectContaining({ entity: "PaySchedule", entityId: "SEMI_MONTHLY", action: "UPDATE" }));

    const after = await (await getSchedules(req("/api/settings/pay-schedules"))).json();
    const semi = after.data.schedules.find((s: { cycle: string }) => s.cycle === "SEMI_MONTHLY");
    expect(semi.isDefault).toBe(false);
    expect(semi.slots).toEqual([MARK[1], MARK[0]]);

    const gap = await putSchedule(req("/api/settings/pay-schedules", "PUT", {
      cycle: "SEMI_MONTHLY",
      slots: [{ payDay: 15, cutoffStartDay: 26, cutoffEndDay: 10 }, { payDay: 30, cutoffStartDay: 12, cutoffEndDay: 25 }],
    }));
    expect(gap.status).toBe(422);
    expect((await gap.json()).error).toMatch(/whole month/);

    await expect(q(
      `INSERT INTO "PaySchedule" (id, "tenantId", cycle, "payDay1", "cutoff1StartDay", "cutoff1EndDay", "updatedAt")
       VALUES ($1, $2, 'WEEKLY', 6, 1, 7, now())`, [id("w"), T],
    )).rejects.toThrow(/PaySchedule_cycle_scheduled/);
    await expect(q(
      `INSERT INTO "PaySchedule" (id, "tenantId", cycle, "payDay1", "cutoff1StartDay", "cutoff1EndDay", "payDay2", "cutoff2StartDay", "cutoff2EndDay", "updatedAt")
       VALUES ($1, $2, 'MONTHLY', 30, 26, 25, 15, 1, 2, now())`, [id("m"), T],
    )).rejects.toThrow(/PaySchedule_slot2_shape/);
  });

  type Payday = { nominalDate: string; payDate: string; moved: boolean; periodStart: string; periodEnd: string; cutoffStart: string; cutoffEnd: string; existingRun: { id: string } | null };
  const paydays = async (): Promise<Payday[]> =>
    (await (await listPaydays(req("/api/payroll/paydays?cycle=SEMI_MONTHLY"))).json()).data.paydays;

  it("R2 paydays move off Sundays and holidays and carry period and cutoff", async () => {
    const list = await paydays();
    expect(list.find((p) => p.nominalDate === "2026-11-15")).toMatchObject({
      payDate: "2026-11-14", moved: true, periodStart: "2026-11-01", periodEnd: "2026-11-15", cutoffStart: "2026-10-26", cutoffEnd: "2026-11-10",
    });
    expect(list.find((p) => p.nominalDate === "2026-11-30")).toMatchObject({
      payDate: "2026-11-28", moved: true, periodStart: "2026-11-16", periodEnd: "2026-11-30", cutoffStart: "2026-11-11", cutoffEnd: "2026-11-25",
    });
  });

  let bookId = "";
  it("R3 a run by payday gets locked dates and reads attendance for the cutoff", async () => {
    const res = await createRun(req("/api/payroll/runs", "POST", { cycle: "SEMI_MONTHLY", runType: "REGULAR", payday: "2026-11-15" }));
    expect(res.status).toBe(202);
    const book = (await res.json()).data;
    bookId = book.id;
    const row = (await q(
      `SELECT "periodStart"::date::text ps, "periodEnd"::date::text pe, "payDate"::date::text pd,
              "cutoffStart"::date::text cs, "cutoffEnd"::date::text ce FROM "PayrollBook" WHERE id = $1`, [bookId],
    )).rows[0];
    expect(row).toEqual({ ps: "2026-11-01", pe: "2026-11-15", pd: "2026-11-14", cs: "2026-10-26", ce: "2026-11-10" });

    await processRun(T, bookId);
    const sheet = (await q(
      `SELECT "basePayCents"::text b, "periodInputSnapshot" pi FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`, [bookId, A],
    )).rows[0];
    expect(sheet.b).toBe((1_250_000n - 114_943n).toString()); // the cutoff's unpaid day, not the period's zero
    expect(sheet.pi.attendanceSource).toBe("MANUAL");
  });

  it("R4 the payday now shows its run", async () => {
    expect((await paydays()).find((p) => p.nominalDate === "2026-11-15")?.existingRun?.id).toBe(bookId);
  });

  it("R5 refusals", async () => {
    const post = async (body: unknown) => {
      const r = await createRun(req("/api/payroll/runs", "POST", body));
      return { status: r.status, error: (await r.json()).error as string };
    };
    expect(await post({ cycle: "SEMI_MONTHLY", runType: "REGULAR", payday: "2026-11-14" })).toMatchObject({ status: 422, error: expect.stringMatching(/not a payday/) });
    expect(await post({ cycle: "SEMI_MONTHLY", runType: "REGULAR", payday: "2026-11-30", periodStart: "2026-11-15", periodEnd: "2026-11-30" }))
      .toMatchObject({ status: 422, error: expect.stringMatching(/cannot be changed/) });
    expect((await post({ cycle: "SEMI_MONTHLY", runType: "OFF_CYCLE", payday: "2026-11-30" })).status).toBe(422);
    expect((await post({ cycle: "SEMI_MONTHLY", runType: "REGULAR" })).status).toBe(422);
  });

  it("R6 a regular run given dates still works, without pay date or cutoff", async () => {
    const res = await createRun(req("/api/payroll/runs", "POST", { cycle: "SEMI_MONTHLY", runType: "REGULAR", periodStart: "2026-10-01", periodEnd: "2026-10-15" }));
    expect(res.status).toBe(202);
    const b = (await res.json()).data;
    expect([b.payDate, b.cutoffStart, b.cutoffEnd]).toEqual([null, null, null]);
  });

  it("R7 (static) the New Run screen sends only the payday for a regular run", () => {
    const src = readFileSync("src/app/(dashboard)/payroll/page.tsx", "utf8");
    expect(src).toMatch(/isRegular\s*\?\s*\{ payday: form\.payday \}/);
    expect(src).toMatch(/aria-label="Run dates \(locked\)"/);
    const regularBranch = src.slice(src.indexOf("{isRegular ? ("), src.indexOf(") : (\n              <div className=\"grid grid-cols-2 gap-3\">"));
    expect(regularBranch).not.toMatch(/type="date"/);
  });

  const sheetOf = async (emp: string) =>
    (await q(
      `SELECT "basePayCents"::text b, "periodInputSnapshot" pi FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [bookId, emp],
    )).rows[0] as { b: string; pi: { attendanceSource: string; unpaidLeaveDays: number; daysWorked: number } };

  it("R8 a new hire on a lagged cutoff is paid the workdays employed in the pay period", async () => {
    const b = await sheetOf(B);
    // 28,000 x 12 / 261 = 1,287.35 a day (centavos floored), 5 workdays (Mon 9 to Fri 13 Nov).
    expect(b.b).toBe((128_735n * 5n).toString());
    expect(b.pi.attendanceSource).toBe("NONE");
  });

  it("R9 approved DTR in the cutoff wins over the typed input; the sheet says which", async () => {
    for (const day of ["2026-11-03", "2026-11-04"]) {
      await q(
        `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
         VALUES ($1, $2, $3, $4, 'ABSENT', 0, 'APPROVED', now())`,
        [`${A}-${day}`, T, A, `${day}T00:00:00.000Z`],
      );
    }
    // An unapproved record is ignored.
    await q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, '2026-11-05T00:00:00.000Z', 'ABSENT', 0, 'PENDING', now())`,
      [`${A}-2026-11-05`, T, A],
    );
    // PAY-173: the other workdays of the cutoff (26 Oct to 10 Nov) are
    // present. Without rows they would now count as absences (a workday with
    // no DTR), which is not what R9 checks.
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
                       "2026-11-02", "2026-11-06", "2026-11-09", "2026-11-10"]) {
      await q(
        `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
         VALUES ($1, $2, $3, $4, 'PRESENT', 480, 'APPROVED', now())`,
        [`${A}-${day}`, T, A, `${day}T00:00:00.000Z`],
      );
    }
    // The company does not require a DTR submission for this check.
    await q(
      `INSERT INTO "DTRApprovalConfig" (id, "tenantId", "requiresEmployeeSubmission", "updatedAt") VALUES ($1, $2, false, now())`,
      [id("dtrcfg"), T],
    );
    await recomputeRun(T, bookId);
    const a = await sheetOf(A);
    expect(a.pi.attendanceSource).toBe("DTR");
    expect(a.pi.unpaidLeaveDays).toBe(2);
    expect(a.b).toBe((1_250_000n - 2n * 114_943n).toString());
    expect((await sheetOf(B)).pi.attendanceSource).toBe("NONE");
  });

  it("R10 DTR submission required but not approved: the typed input is used, flagged", async () => {
    await q(`UPDATE "DTRApprovalConfig" SET "requiresEmployeeSubmission" = true WHERE "tenantId" = $1`, [T]);
    await recomputeRun(T, bookId);
    const a = await sheetOf(A);
    expect(a.pi.attendanceSource).toBe("DTR_NOT_APPROVED");
    expect(a.pi.unpaidLeaveDays).toBe(1); // the typed input for the cutoff
    expect(a.b).toBe((1_250_000n - 114_943n).toString());
  });
});
