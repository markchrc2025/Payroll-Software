/**
 * Wave E1 (PAY-215) against real Postgres: Leave Earning Policies write the
 * employees' leave entitlements.
 *
 *   D1  the preview: a July joiner starts on the hire date, pro-rated (the
 *       accrual for July is 17 of 31 days of the monthly amount); a long-
 *       serving employee starts on the effective date at the tier already
 *       reached and moves up at the next anniversary; an employee outside the
 *       assignment is left out; with "from regularization" an employee not
 *       yet regular is skipped (fails on main: no route).
 *   D2  applying writes the entitlements; applying twice changes nothing.
 *   D3  an open entitlement that started earlier is ended the day before; a
 *       later effective date ends the policy's own earlier entitlement and
 *       starts new ones; one that has already accrued on or after the new
 *       start makes the employee skipped, never edited.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import Decimal from "decimal.js";
import { computeAccrual, periodContaining } from "@/lib/leave/accrual-math";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wet${sfx}`;
const U = `weu${sfx}`;
const E = { joiner: `wej${sfx}`, senior: `wes${sfx}`, prob: `wep${sfx}`, other: `weo${sfx}` };
const LT = `wel${sfx}`;
const LEVEL = `wev${sfx}`;
const OTHER_LEVEL = `wew${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as createPolicy } from "@/app/api/leave-earning-policies/route";
import { PATCH as editPolicy } from "@/app/api/leave-earning-policies/[id]/route";
import { GET as preview } from "@/app/api/leave-earning-policies/[id]/preview/route";
import { POST as apply } from "@/app/api/leave-earning-policies/[id]/apply/route";

type Plan = { employeeNumber: string; action: string; reason: string | null; segments: { startDate: string; endDate: string | null; accrualAmount: string }[] }[];
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const jreq = (url: string, body: unknown, method = "POST") => new NextRequest(url, { method, body: JSON.stringify(body) });
const POLICY = {
  name: "Vacation, office staff", leaveTypeId: LT, accrualFrequency: "MONTHLY", accrualAmount: "1.25",
  tiers: [{ fromYear: 3, accrualAmount: "1.6667" }], proRate: true, earnFrom: "HIRE",
  assignment: { employmentStatuses: [], levelIds: [LEVEL], departmentIds: [], jobTypeIds: [] }, effectiveFrom: "2026-01-01",
};

describeDb("Wave E1 leave earning policies (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ents = async (emp: string) => (await q(
    `SELECT "startDate"::date::text s, "endDate"::date::text e, "accrualAmount"::text a, "proRate" p, "policyId" pol FROM "LeaveEntitlement" WHERE "employeeId" = $1 AND "deletedAt" IS NULL ORDER BY "startDate"`, [emp])).rows;
  let policyId = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = U;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WE${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    await q(`INSERT INTO "JobLevel" (id, "tenantId", name, rank, "updatedAt") VALUES ($1, $2, 'Staff', 1, now()), ($3, $2, 'Managers', 2, now())`, [LEVEL, T, OTHER_LEVEL]);
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.25, now())`, [LT, T]);
    for (const [id, num, hire, status, reg, level] of [
      [E.joiner, "J-1", "2026-07-15", "PROBATIONARY", null, LEVEL], [E.senior, "S-1", "2023-03-06", "REGULAR", "2023-09-06", LEVEL],
      [E.prob, "P-1", "2026-05-04", "PROBATIONARY", null, LEVEL], [E.other, "O-1", "2020-01-06", "REGULAR", "2020-07-06", OTHER_LEVEL],
    ] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "regularizationDate", "levelId", "updatedAt") VALUES ($1, $2, $3, 'X', $3, $4, $5::"EmploymentStatus", $6, $7, now())`, [id, T, num, hire, status, reg, level]);
    }
    // A manual entitlement for the senior employee, open since 2024.
    await q(`INSERT INTO "LeaveEntitlement" (id, "tenantId", "employeeId", "leaveTypeId", "startDate", "accrualAmount", "accrualFrequency", "updatedAt") VALUES ($1, $2, $3, $4, '2024-01-01', 1, 'MONTHLY', now())`, [`wem${sfx}`, T, E.senior, LT]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["LeaveTransaction", "LeaveBalance", "LeaveEntitlement", "LeaveEarningPolicy", "LeaveType"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "JobLevel" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the preview", async () => {
    const res = await createPolicy(jreq("http://localhost/api/leave-earning-policies", POLICY));
    expect(res.status).toBe(201);
    policyId = (await res.json()).data.id;
    const plan = (await (await preview(new NextRequest("http://localhost/x"), ctx(policyId))).json()).data as Plan;
    expect(plan.map((p) => [p.employeeNumber, p.action])).toEqual([["J-1", "CREATE"], ["P-1", "CREATE"], ["S-1", "CREATE"]]);
    const j = plan.find((p) => p.employeeNumber === "J-1")!;
    expect(j.segments[0]).toEqual({ startDate: "2026-07-15", endDate: "2029-07-14", accrualAmount: "1.2500" });
    expect(j.segments[1]).toEqual({ startDate: "2029-07-15", endDate: null, accrualAmount: "1.6667" });
    const s = plan.find((p) => p.employeeNumber === "S-1")!;
    expect(s.segments).toEqual([
      { startDate: "2026-01-01", endDate: "2026-03-05", accrualAmount: "1.2500" },
      { startDate: "2026-03-06", endDate: null, accrualAmount: "1.6667" },
    ]);
    // The joiner's July, pro-rated as the accrual job does it.
    const july = computeAccrual({ period: periodContaining("MONTHLY", new Date("2026-07-31T00:00:00Z")), entitlementStart: new Date("2026-07-15T00:00:00Z"), entitlementEnd: null, servedUntil: null, proRate: true, accrualAmount: new Decimal("1.25") } as Parameters<typeof computeAccrual>[0]);
    expect(july.coveredDays).toBe(17);

    const reg = await editPolicy(jreq("http://x", { ...POLICY, earnFrom: "REGULARIZATION" }, "PATCH"), ctx(policyId));
    expect(reg.status).toBe(200);
    const plan2 = (await (await preview(new NextRequest("http://localhost/x"), ctx(policyId))).json()).data as Plan;
    expect(plan2.find((p) => p.employeeNumber === "P-1")).toMatchObject({ action: "SKIP", reason: "Not yet regularized" });
    await editPolicy(jreq("http://x", POLICY, "PATCH"), ctx(policyId));
  });

  it("D2 applying, and applying again", async () => {
    const res = await apply(new NextRequest("http://x", { method: "POST" }), ctx(policyId));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ created: 6, employees: 3, already: 0, skipped: 0 });
    expect(await ents(E.joiner)).toEqual([
      { s: "2026-07-15", e: "2029-07-14", a: "1.2500", p: true, pol: policyId },
      { s: "2029-07-15", e: null, a: "1.6667", p: true, pol: policyId },
    ]);
    // The manual one is ended the day before.
    expect((await ents(E.senior))[0]).toEqual({ s: "2024-01-01", e: "2025-12-31", a: "1.0000", p: false, pol: null });
    expect(await ents(E.other)).toEqual([]);
    const again = await apply(new NextRequest("http://x", { method: "POST" }), ctx(policyId));
    expect((await again.json()).data).toEqual({ created: 0, employees: 0, already: 3, skipped: 0 });
  });

  it("D3 a change from a later date, and what has accrued is never edited", async () => {
    // The joiner accrued in August on the first entitlement.
    const first = (await q(`SELECT id FROM "LeaveEntitlement" WHERE "employeeId" = $1 AND "startDate" = '2026-07-15'`, [E.joiner])).rows[0].id;
    await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, "updatedAt") VALUES ($1, $2, $3, $4, 2026, now())`, [`web${sfx}`, T, E.joiner, LT]);
    await q(`INSERT INTO "LeaveTransaction" (id, "tenantId", "employeeId", "leaveTypeId", "leaveBalanceId", type, amount, "approvalStatus", "entitlementId", "periodKey") VALUES ($1, $2, $3, $4, $5, 'ACCRUAL', 1.25, 'APPROVED', $6, '2026-08')`, [`wex${sfx}`, T, E.joiner, LT, `web${sfx}`, first]);

    await editPolicy(jreq("http://x", { ...POLICY, accrualAmount: "1.5", effectiveFrom: "2027-01-01" }, "PATCH"), ctx(policyId));
    const r = (await (await apply(new NextRequest("http://x", { method: "POST" }), ctx(policyId))).json()).data;
    expect(r).toMatchObject({ employees: 3, skipped: 0 });
    const j = await ents(E.joiner);
    expect(j.map((x: { s: string; e: string | null; a: string }) => [x.s, x.e, x.a])).toEqual([
      ["2026-07-15", "2026-12-31", "1.2500"],
      ["2027-01-01", "2029-07-14", "1.5000"],
      ["2029-07-15", null, "1.6667"],
    ]);

    // Moving the date back to before what accrued: that employee is skipped.
    await editPolicy(jreq("http://x", { ...POLICY, accrualAmount: "2", effectiveFrom: "2026-08-01" }, "PATCH"), ctx(policyId));
    const plan = (await (await preview(new NextRequest("http://localhost/x"), ctx(policyId))).json()).data as Plan;
    expect(plan.find((p) => p.employeeNumber === "J-1")).toMatchObject({ action: "SKIP" });
    expect(plan.find((p) => p.employeeNumber === "J-1")!.reason).toContain("already accrued");
  });
});
