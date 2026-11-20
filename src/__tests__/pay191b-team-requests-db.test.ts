/**
 * PAY-191 part 2 (Wave 3, Mark 20 Nov 2026): Team requests in ESS. An employee
 * named as an approver in a request's approval chain sees the requests waiting
 * for them and approves or rejects them in ESS.
 *
 * Company workflow DEFAULT: supervisor, then line manager, for leave and for
 * timekeeping (OT and undertime use the DTR toggle). Rosa files; Sam is her
 * immediate supervisor, Mia her manager.
 *
 *   W1  (T1) overtime filed in ESS shows in Sam's Team requests (step 1 of 2)
 *       and not yet in Mia's.
 *   W2  Sam approves: it moves to Mia; Mia approves: the overtime is approved
 *       and its 2 hours land on the day's DTR, as when HR approves.
 *   W3  leave filed in ESS now snapshots its chain; Sam must give a reason to
 *       reject; rejecting ends it (Mia never sees it) and Rosa sees the reason.
 *   W4  only the assigned approver of the due step acts: Mia cannot act on
 *       Sam's step, nor on hers before Sam; a decided request cannot be decided
 *       again.
 *   W5  undertime goes through both steps to APPROVED.
 *   W6  with no workflow, nothing goes to Team requests and the request waits
 *       for HR as before (ruling B5).
 *   W7  ESS shows a Team requests tab with Approve and Reject in the sheet.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p91bt${sfx}`;
const id = (s: string) => `p91b${s}${sfx}`;
const ROSA = id("rosa");
const SAM = id("sam");
const MIA = id("mia");
const WF = id("wf");
const LT = id("lt");

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));
vi.mock("@/lib/jobs/workers", () => ({ enqueueOtApproved: vi.fn(async () => undefined) }));

import { POST as fileOt } from "@/app/api/ess/ot-applications/route";
import { POST as fileUt } from "@/app/api/ess/undertime/route";
import { POST as fileLeave } from "@/app/api/ess/leaves/route";
import { GET as teamList } from "@/app/api/ess/team-requests/route";
import { POST as decide } from "@/app/api/ess/team-requests/[stepId]/route";
import { toTeamItems, type TeamRow } from "@/components/ess/requests";

const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const as = (employeeId: string) => { ess.employeeId = employeeId; };
const team = async (who: string) => {
  as(who);
  const r = await teamList(req("/api/ess/team-requests"));
  expect(r.status).toBe(200);
  return ((await r.json()).data as TeamRow[]);
};
const act = async (who: string, stepId: string, decision: "APPROVE" | "REJECT", note?: string) => {
  as(who);
  return decide(req(`/api/ess/team-requests/${stepId}`, { decision, note }), { params: Promise.resolve({ stepId }) });
};

describeDb("PAY-191 part 2 ESS Team requests (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P91B${sfx}`.toUpperCase()]);
    const step = (roleKey: string) => ({ roleKey, forLeave: true, forDtr: true, forExpense: false, forDocument: false });
    await q(
      `INSERT INTO "ApprovalWorkflow" (id, "tenantId", code, approvers, "updatedAt") VALUES ($1, $2, 'DEFAULT', $3::jsonb, now())`,
      [WF, T, JSON.stringify([step("supervisor"), step("line_manager")])],
    );
    for (const [e, first] of [[SAM, "Sam"], [MIA, "Mia"], [ROSA, "Rosa"]]) {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
         VALUES ($1, $2, $1, $3, 'Team', '2025-01-06', now())`,
        [e, T, first],
      );
    }
    await q(`UPDATE "Employee" SET "immediateSupervisorId" = $1, "managerId" = $2 WHERE id = $3`, [SAM, MIA, ROSA]);
    await q(
      `INSERT INTO "LeaveType" (id, "tenantId", name, code, "isPaid", "accrualAmount", "updatedAt") VALUES ($1, $2, 'Leave Without Pay', 'LWOP', false, 0, now())`,
      [LT, T],
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const t of ["ApprovalStep", "AuditLog", "DTRRecord", "OTApplication", "UndertimeRequest", "LeaveTransaction", "LeaveBalance", "LeaveType"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`UPDATE "Employee" SET "immediateSupervisorId" = NULL, "managerId" = NULL WHERE "tenantId" = $1`, [T]);
    for (const t of ["Employee", "ApprovalWorkflow"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  let otStep1 = "";
  let otId = "";

  it("W1 (T1) overtime filed in ESS shows in the supervisor's Team requests, step 1 of 2", async () => {
    as(ROSA);
    const r = await fileOt(req("/api/ess/ot-applications", { date: "2026-11-18", hours: 2, justification: "Month-end count" }));
    expect(r.status).toBe(200);
    otId = (await r.json()).data.id;
    const sam = await team(SAM);
    expect(sam).toHaveLength(1);
    expect(sam[0]).toMatchObject({ module: "OT", entityId: otId, title: "Overtime", amount: "2 hour(s)", stepIndex: 0, steps: 2, reason: "Month-end count" });
    expect(sam[0].employee).toMatchObject({ id: ROSA, name: "Rosa Team" });
    otStep1 = sam[0].stepId;
    expect(await team(MIA)).toEqual([]);
    expect(await team(ROSA)).toEqual([]);
  });

  it("W4 only the assigned approver of the due step acts", async () => {
    expect((await act(MIA, otStep1, "APPROVE")).status).toBe(403);
    const mias = (await q(`SELECT id FROM "ApprovalStep" WHERE "entityId" = $1 AND "stepIndex" = 1`, [otId])).rows[0].id;
    expect((await act(MIA, mias, "APPROVE")).status).toBe(409);
    expect((await act(ROSA, otStep1, "APPROVE")).status).toBe(403);
  });

  it("W2 the supervisor approves, then the manager; the overtime lands on the DTR", async () => {
    const one = await act(SAM, otStep1, "APPROVE");
    expect(one.status).toBe(200);
    expect((await one.json()).data).toMatchObject({ final: false, status: "PENDING" });
    expect(await team(SAM)).toEqual([]);
    const mia = await team(MIA);
    expect(mia.map((m) => [m.entityId, m.stepIndex])).toEqual([[otId, 1]]);

    const two = await act(MIA, mia[0].stepId, "APPROVE");
    expect(two.status).toBe(200);
    expect((await two.json()).data).toMatchObject({ final: true, status: "APPROVED" });
    const ot = (await q(`SELECT status FROM "OTApplication" WHERE id = $1`, [otId])).rows[0];
    expect(ot.status).toBe("APPROVED");
    const dtr = (await q(`SELECT "otMinutes" m FROM "DTRRecord" WHERE "employeeId" = $1 AND date = '2026-11-18'`, [ROSA])).rows[0];
    expect(dtr.m).toBe(120);
    expect(await team(MIA)).toEqual([]);
    expect((await act(MIA, mia[0].stepId, "APPROVE")).status).toBe(409);
    const audit = (await q(`SELECT action, entity FROM "AuditLog" WHERE "tenantId" = $1 AND "entityId" = $2 ORDER BY "createdAt"`, [T, otId])).rows;
    expect(audit).toEqual([{ action: "APPROVE", entity: "OTApplication" }, { action: "APPROVE", entity: "OTApplication" }]);
  });

  it("W3 leave filed in ESS snapshots its chain; rejecting needs a reason and ends it", async () => {
    as(ROSA);
    const r = await fileLeave(req("/api/ess/leaves", { leaveTypeId: LT, startDate: "2026-11-27", endDate: "2026-11-27", amount: 1, reason: "Family errand" }));
    expect(r.status).toBe(201);
    const leaveId = (await r.json()).data.id;
    const sam = await team(SAM);
    expect(sam.map((s) => [s.module, s.entityId, s.title, s.amount])).toEqual([["LEAVE", leaveId, "Leave Without Pay", "1 day(s)"]]);

    expect((await act(SAM, sam[0].stepId, "REJECT")).status).toBe(422);
    expect((await act(SAM, sam[0].stepId, "REJECT", "Inventory week")).status).toBe(200);
    const l = (await q(`SELECT "approvalStatus" s, "rejectionReason" r FROM "LeaveTransaction" WHERE id = $1`, [leaveId])).rows[0];
    expect(l).toEqual({ s: "REJECTED", r: "Inventory week" });
    expect(await team(MIA)).toEqual([]);
    expect(await team(SAM)).toEqual([]);
  });

  it("W5 undertime goes through both steps to approved", async () => {
    as(ROSA);
    const r = await fileUt(req("/api/ess/undertime", { date: "2026-11-19", undertimeMinutes: 60, reason: "Clinic appointment" }));
    expect(r.status).toBe(200);
    const utId = (await r.json()).data.id;
    const s1 = (await team(SAM))[0];
    expect(s1).toMatchObject({ module: "UNDERTIME", amount: "60 min" });
    expect((await act(SAM, s1.stepId, "APPROVE")).status).toBe(200);
    const s2 = (await team(MIA))[0];
    expect((await act(MIA, s2.stepId, "APPROVE")).status).toBe(200);
    expect((await q(`SELECT status FROM "UndertimeRequest" WHERE id = $1`, [utId])).rows[0].status).toBe("APPROVED");
  });

  it("W6 with no workflow, nothing goes to Team requests; the request waits for HR", async () => {
    await q(`UPDATE "ApprovalWorkflow" SET "isActive" = false WHERE id = $1`, [WF]);
    as(ROSA);
    const r = await fileOt(req("/api/ess/ot-applications", { date: "2026-11-19", hours: 1, justification: "Late delivery" }));
    expect(r.status).toBe(200);
    const id2 = (await r.json()).data.id;
    expect(await team(SAM)).toEqual([]);
    expect((await q(`SELECT status FROM "OTApplication" WHERE id = $1`, [id2])).rows[0].status).toBe("PENDING");
    expect((await q(`SELECT count(*)::int n FROM "ApprovalStep" WHERE "entityId" = $1`, [id2])).rows[0].n).toBe(0);
    await q(`UPDATE "ApprovalWorkflow" SET "isActive" = true WHERE id = $1`, [WF]);
  });
});

describe("PAY-191 part 2 ESS Team requests screen", () => {
  it("W7 Team requests become cards with who and what; the sheet has Approve and Reject", () => {
    const items = toTeamItems([
      { stepId: "s1", module: "LEAVE", entityId: "l1", employee: { id: "e", name: "Rosa Team", employeeNumber: "EMP-0007" }, title: "Vacation Leave", date: "2026-11-27T00:00:00.000Z", endDate: "2026-11-28T00:00:00.000Z", amount: "2 day(s)", reason: "Trip", stepIndex: 1, steps: 2, filedAt: "2026-11-20T01:00:00.000Z" },
    ]);
    expect(items[0]).toMatchObject({ stepId: "s1", title: "Rosa Team · Vacation Leave", sub: "Nov 27, 2026 to Nov 28, 2026 · 2 day(s)", status: "Pending" });
    expect(items[0].fields).toContainEqual(["Employee", "Rosa Team (EMP-0007)"]);
    expect(items[0].fields).toContainEqual(["Approval", "Step 2 of 2"]);
    const src = readFileSync("src/components/ess/requests.tsx", "utf8");
    expect(src).toMatch(/Team requests \(\{teamItems\.length\}\)/);
    expect(src).toMatch(/\/api\/ess\/team-requests\/\$\{stepId\}/);
    expect(src).toMatch(/aria-label="Reason for rejecting"/);
  });
});
