/**
 * Wave E3 (PAY-215, decision 9) against real Postgres: Leave Schedule and
 * Planner.
 *
 *   D1  a shutdown files approved leave for the department on each person's
 *       working days less holidays, debits the balance, and skips someone
 *       already on leave; filing again changes nothing (fails on main: no
 *       route).
 *   D2  a blackout set to block refuses an ESS request touching it; one set to
 *       flag lets it through and Leave Review shows it.
 *   D3  the planner counts who is off per day and warns over the department's
 *       limit; the ESS team calendar shows only approved colleagues, by name.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wst${sfx}`;
const id = (k: string) => `ws${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { POST as createSchedule } from "@/app/api/leave-schedules/route";
import { POST as applySchedule } from "@/app/api/leave-schedules/[id]/apply/route";
import { POST as essFile } from "@/app/api/ess/leaves/route";
import { GET as plannerGet } from "@/app/api/leave/planner/route";
import { GET as teamCal } from "@/app/api/ess/team-calendar/route";
import { GET as inbox } from "@/app/api/approvals/inbox/route";

const jreq = (url: string, body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body) });

describeDb("Wave E3 leave schedule and planner (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = id("u"); ess.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WS${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Department" (id, "tenantId", name, "maxOnLeave", "updatedAt") VALUES ($1, $2, 'Ops', 1, now()), ($3, $2, 'Sales', null, now())`, [id("ops"), T, id("sales")]);
    for (const [e, num, first, dept] of [[id("ana"), "A-1", "Ana", id("ops")], [id("ben"), "B-1", "Ben", id("ops")], [id("cara"), "C-1", "Cara", id("sales")]]) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "departmentId", "updatedAt") VALUES ($1, $2, $3, $4, 'X', '2024-01-08', 'REGULAR', $5, now())`, [e, T, num, first, dept]);
    }
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.25, now())`, [id("vl"), T]);
    for (const e of ["ana", "ben", "cara"]) await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, earned, "updatedAt") VALUES ($1, $2, $3, $4, 2026, 10, now())`, [id(`b${e}`), T, id(e), id("vl")]);
    // Ben is already on leave on 28 December.
    await q(`INSERT INTO "LeaveTransaction" (id, "tenantId", "employeeId", "leaveTypeId", "leaveBalanceId", type, amount, "paidUnits", "approvalStatus", "startDate", "endDate") VALUES ($1, $2, $3, $4, $5, 'USAGE', 1, 1, 'APPROVED', '2026-12-28', '2026-12-28')`, [id("benl"), T, id("ben"), id("vl"), id("bben")]);
    // 30 December is a holiday.
    await q(`INSERT INTO "Holiday" (id, "tenantId", name, category, date, "updatedAt") VALUES ($1, $2, 'Rizal Day', 'LEGAL', '2026-12-30', now())`, [id("hol"), T]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["DTRRecord", "ApprovalStep", "LeaveTransaction", "LeaveBalance", "LeaveSchedule", "LeaveType", "Holiday", "Employee", "Department"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 a shutdown files leave", async () => {
    const res = await createSchedule(jreq("http://x", { kind: "SHUTDOWN", name: "Year-end shutdown", startDate: "2026-12-28", endDate: "2027-01-01", departmentIds: [id("ops")], leaveTypeId: id("vl") }));
    expect(res.status).toBe(201);
    const s = (await res.json()).data;
    const ap = await applySchedule(new NextRequest("http://x", { method: "POST" }), { params: Promise.resolve({ id: s.id }) });
    expect((await ap.json()).data).toEqual({ filed: 1, already: 0, skipped: 1 });
    // Mon 28 to Fri 1 Jan, less the 30th: 4 working days (1 Jan not a holiday here).
    const ana = (await q(`SELECT amount::text a, "approvalStatus" s FROM "LeaveTransaction" WHERE "employeeId" = $1 AND "periodKey" = $2`, [id("ana"), `SCHED-${s.id}`])).rows;
    expect(ana).toEqual([{ a: "4.0000", s: "APPROVED" }]);
    expect((await q(`SELECT used::text u FROM "LeaveBalance" WHERE id = $1`, [id("bana")])).rows[0].u).toBe("4.0000");
    const again = await applySchedule(new NextRequest("http://x", { method: "POST" }), { params: Promise.resolve({ id: s.id }) });
    expect((await again.json()).data).toEqual({ filed: 0, already: 1, skipped: 1 });
  });

  it("D2 blackout dates", async () => {
    await createSchedule(jreq("http://x", { kind: "BLACKOUT", name: "Inventory week", startDate: "2027-01-11", endDate: "2027-01-15", blackoutMode: "BLOCK" }));
    await createSchedule(jreq("http://x", { kind: "BLACKOUT", name: "Peak season", startDate: "2027-02-01", endDate: "2027-02-05", departmentIds: [id("sales")], blackoutMode: "FLAG" }));
    ess.employeeId = id("cara");
    const blocked = await essFile(jreq("http://x", { leaveTypeId: id("vl"), startDate: "2027-01-14", endDate: "2027-01-14", amount: 1 }));
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).error).toContain("Inventory week");
    const flagged = await essFile(jreq("http://x", { leaveTypeId: id("vl"), startDate: "2027-02-02", endDate: "2027-02-02", amount: 1 }));
    expect(flagged.status).toBe(201);
    const items = (await (await inbox(new NextRequest("http://x/api/approvals/inbox?module=LEAVE"))).json()).data as { employee: { employeeNumber: string }; exceptions: string[] }[];
    expect(items.find((i) => i.employee.employeeNumber === "C-1")!.exceptions).toContain("Falls in the blackout period Peak season");
  });

  it("D3 the planner and the team calendar", async () => {
    const res = await plannerGet(new NextRequest("http://x/api/leave/planner?from=2026-12-28&to=2026-12-29"));
    const ops = ((await res.json()).data as { department: string; days: { date: string; off: { name: string }[]; over: boolean }[] }[]).find((d) => d.department === "Ops")!;
    expect(ops.days.map((d) => [d.date, d.off.map((o) => o.name).sort(), d.over])).toEqual([
      ["2026-12-28", ["Ana X", "Ben X"], true],
      ["2026-12-29", ["Ana X"], false],
    ]);
    ess.employeeId = id("ben");
    const cal = (await (await teamCal(new NextRequest("http://x/api/ess/team-calendar?from=2026-12-28&to=2026-12-29"))).json()).data;
    expect(cal).toEqual([{ date: "2026-12-28", away: ["Ana X"] }, { date: "2026-12-29", away: ["Ana X"] }]);
  });
});
