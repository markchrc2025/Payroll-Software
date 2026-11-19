/**
 * PAY-172 (Mark, 19 Nov 2026). An employee with Time Clock Needed on is paid
 * only for days with an approved DTR, in regular runs:
 *   - default: a scheduled workday without an approved DTR (no row, or a row
 *     still pending) counts as absent;
 *   - strict DTR policy (company setting): an employee whose DTR for the
 *     cutoff is not fully approved is held out of the run ("DTR approval is
 *     one cutoff period, not per day");
 *   - HR and the employee's immediate supervisor are emailed, and the run page
 *     lists them.
 *
 *   P1  (T1) no DTR at all: every scheduled workday is absent (it used to be
 *       paid in full); the run lists the employee with the days.
 *   P2  a pending day counts as absent; approved days are paid.
 *   P3  Attendance Exempt and Time Clock Needed off are paid in full, unlisted.
 *   P4  typed run input for the cutoff still wins (MANUAL), unlisted.
 *   P5  strict policy: employees with gaps are left out and listed as held;
 *       once the DTR is approved and the run recomputed, they are paid.
 *   P6  other run types are untouched (no hold, no list).
 *   P7  HR (the run's creator) gets everyone, each supervisor their own; a
 *       second compute does not email again.
 *   P8  the setting is saved by the settings API and shown on Pay Rules; the
 *       run page lists the employees.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p172t${sfx}`;
const id = (s: string) => `p172${s}${sfx}`;

import prismaAdmin from "@/lib/prisma-admin";
import { createDraftRun, recomputeRun } from "@/lib/payroll/persist";
import { notifyDtrGaps } from "@/lib/payroll/dtr-gap-notify";

const DAY = 114_943n; // 25,000 x 12 / 261, centavos floored
const HALF = 1_250_000n;
const WORKDAYS = ["02", "03", "04", "05", "06", "09", "10", "11", "12", "13"].map((d) => `2026-11-${d}`);

describeDb("PAY-172 DTR policy in regular runs (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const E = { none: id("none"), pend: id("pend"), exempt: id("exempt"), noclock: id("noclock"), typed: id("typed") };
  const HR = id("hr");
  let bookId = "";

  const sheet = async (emp: string, book = bookId) =>
    (await q(
      `SELECT "basePayCents"::text b, "periodInputSnapshot" pi FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [book, emp],
    )).rows[0] as { b: string; pi: { attendanceSource: string; unpaidLeaveDays: number } } | undefined;
  const gaps = async () =>
    ((await q(`SELECT "dtrGaps" g FROM "PayrollBook" WHERE id = $1`, [bookId])).rows[0].g ?? []) as {
      employeeId: string; days: number; held: boolean; notifiedAt?: string;
    }[];
  const dtr = (emp: string, day: string, status: string) =>
    q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4, 'PRESENT', 480, $5, now())`,
      [`${emp}-${day}`, T, emp, `${day}T00:00:00.000Z`, status],
    );

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P172${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p172-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'HR', now())`,
      [HR, T, `hr-${sfx}@example.test`],
    );
    const emp = async (key: string, flags: { needsTimeClock: boolean; attendanceExempt: boolean }, extra: Record<string, unknown> = {}) => {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "attendanceExempt", "workEmail", "updatedAt")
         VALUES ($1, $2, $1, 'P172', $1, '2025-01-06', $3, $4, $5, now())`,
        [key, T, flags.needsTimeClock, flags.attendanceExempt, extra.workEmail ?? null],
      );
      await q(
        `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
         VALUES ($1, $2, $3, '2025-01-06', 2500000, 'MONTHLY', now())`,
        [`${key}-t`, T, key],
      );
    };
    await emp(E.noclock, { needsTimeClock: false, attendanceExempt: false }, { workEmail: `sup-${sfx}@example.test` });
    await emp(E.none, { needsTimeClock: true, attendanceExempt: false });
    await emp(E.pend, { needsTimeClock: true, attendanceExempt: false });
    await emp(E.exempt, { needsTimeClock: false, attendanceExempt: true });
    await emp(E.typed, { needsTimeClock: true, attendanceExempt: false });
    await q(`UPDATE "Employee" SET "immediateSupervisorId" = $1 WHERE id = $2`, [E.noclock, E.pend]);
    for (const d of WORKDAYS) await dtr(E.pend, d, d === "2026-11-05" ? "PENDING" : "APPROVED");
    await q(
      `INSERT INTO "PeriodInput" (id, "tenantId", "employeeId", "periodStart", "periodEnd", "unpaidLeaveDays", "updatedAt")
       VALUES ($1, $2, $3, '2026-11-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z', 0, now())`,
      [`${E.typed}-pi`, T, E.typed],
    );
    const book = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-15T00:00:00Z"),
      cycle: "SEMI_MONTHLY", createdByUserId: HR,
    });
    bookId = book.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`UPDATE "Employee" SET "immediateSupervisorId" = NULL WHERE "tenantId" = $1`, [T]);
    for (const t of ["PeriodInput", "DTRRecord", "EmploymentTerm", "Employee", "StatutoryRule", "User"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("P1 (T1) no DTR at all: every scheduled workday is absent, and the run lists the employee", async () => {
    const s = (await sheet(E.none))!;
    expect(s.pi.unpaidLeaveDays).toBe(10);
    expect(s.b).toBe((HALF - 10n * DAY).toString());
    expect(await gaps()).toContainEqual({ employeeId: E.none, days: 10, held: false });
  });

  it("P2 a pending day counts as absent; approved days are paid", async () => {
    const s = (await sheet(E.pend))!;
    expect(s.pi.unpaidLeaveDays).toBe(1);
    expect(s.b).toBe((HALF - DAY).toString());
    expect(await gaps()).toContainEqual({ employeeId: E.pend, days: 1, held: false });
  });

  it("P3 Attendance Exempt and Time Clock Needed off are paid in full, unlisted", async () => {
    expect((await sheet(E.exempt))!.b).toBe(HALF.toString());
    expect((await sheet(E.noclock))!.b).toBe(HALF.toString());
    const listed = (await gaps()).map((g) => g.employeeId);
    expect(listed).not.toContain(E.exempt);
    expect(listed).not.toContain(E.noclock);
  });

  it("P4 typed run input for the cutoff still wins", async () => {
    const s = (await sheet(E.typed))!;
    expect(s.pi.attendanceSource).toBe("MANUAL");
    expect(s.b).toBe(HALF.toString());
    expect((await gaps()).map((g) => g.employeeId)).not.toContain(E.typed);
  });

  it("P7 HR gets everyone, the supervisor their own; a second compute does not email again", async () => {
    const sent: { to: string; rows: { name: string }[] }[] = [];
    const send = vi.fn(async (m: { to: string; rows: { name: string }[] }) => { sent.push(m); });
    await notifyDtrGaps(prismaAdmin, T, bookId, { send: send as never, appUrl: "https://app.test" });
    const hr = sent.find((m) => m.to === `hr-${sfx}@example.test`)!;
    expect(hr.rows.map((r) => r.name).sort()).toEqual([`P172 ${E.none}`, `P172 ${E.pend}`].sort());
    const sup = sent.find((m) => m.to === `sup-${sfx}@example.test`)!;
    expect(sup.rows.map((r) => r.name)).toEqual([`P172 ${E.pend}`]);
    expect((await gaps()).every((g) => !!g.notifiedAt)).toBe(true);

    await recomputeRun(T, bookId);
    expect((await gaps()).every((g) => !!g.notifiedAt)).toBe(true);
    sent.length = 0;
    await notifyDtrGaps(prismaAdmin, T, bookId, { send: send as never });
    expect(sent).toEqual([]);
  });

  it("P5 strict policy holds employees with gaps; approving the DTR and recomputing pays them", async () => {
    await q(`UPDATE "Tenant" SET "strictDtrPolicy" = true WHERE id = $1`, [T]);
    await recomputeRun(T, bookId);
    expect(await sheet(E.none)).toBeUndefined();
    expect(await sheet(E.pend)).toBeUndefined();
    expect((await sheet(E.exempt))!.b).toBe(HALF.toString());
    expect((await sheet(E.typed))!.b).toBe(HALF.toString());
    const held = await gaps();
    expect(held.filter((g) => g.held).map((g) => g.employeeId).sort()).toEqual([E.none, E.pend].sort());

    await q(`UPDATE "DTRRecord" SET "approvalStatus" = 'APPROVED' WHERE "employeeId" = $1`, [E.pend]);
    await recomputeRun(T, bookId);
    expect((await sheet(E.pend))!.b).toBe(HALF.toString());
    expect((await gaps()).map((g) => g.employeeId)).toEqual([E.none]);
  });

  it("P6 other run types are untouched: no hold and no list on an off-cycle run", async () => {
    const off = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-15T00:00:00Z"),
      cycle: "SEMI_MONTHLY", runType: "OFF_CYCLE", employeeIds: [E.none],
    });
    expect(await sheet(E.none, off.id)).toBeDefined();
    expect((await q(`SELECT "dtrGaps" g FROM "PayrollBook" WHERE id = $1`, [off.id])).rows[0].g).toBeNull();
  });

  it("P8 the setting is saved and shown; the run page lists the employees", () => {
    expect(readFileSync("src/app/api/settings/tenant/route.ts", "utf8")).toMatch(/strictDtrPolicy: z\.boolean\(\)\.optional\(\)/);
    const rules = readFileSync("src/app/(dashboard)/settings/pay-rules/page.tsx", "utf8");
    expect(rules).toMatch(/title="Strict DTR Policy"/);
    expect(rules).toMatch(/update\("strictDtrPolicy", v\)/);
    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(page).toMatch(/run\.dtrGaps!\.map/);
    expect(page).toMatch(/salary held until the DTR for the cutoff is approved/);
  });
});
