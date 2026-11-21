/**
 * Wave C0 to C2 (PAY-213) against real Postgres: the shared approval inbox.
 *
 *   D1  Expense: the owner sees every submitted claim but their own, with the
 *       limit flags and a missing receipt as exceptions; a role without
 *       PAYROLL:APPROVE sees nothing (fails on main: no /api/approvals/inbox).
 *   D2  Leave: an approver assigned to a request's due step sees it as their
 *       step; the owner sees requests with no chain, and chained ones as an
 *       override; the balance after the pending requests and the others in
 *       the department off on those dates are shown, and make exceptions.
 *   D3  Expense: a claim sent back is a draft again with the note; one's own
 *       claim cannot be sent back.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wct${sfx}`;
const OWNER = `wco${sfx}`;
const SUP = `wcs${sfx}`;
const CLERK = `wck${sfx}`;
const ROLE = `wcr${sfx}`;
const E = { owner: `wceo${sfx}`, sup: `wces${sfx}`, ana: `wcea${sfx}`, ben: `wceb${sfx}`, cara: `wcec${sfx}` };
const DEPT = `wcd${sfx}`;
const LT = `wcl${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as inbox } from "@/app/api/approvals/inbox/route";
import { POST as sendBack } from "@/app/api/expense-claims/[id]/return/route";

const list = async (module: string) => {
  const res = await inbox(new NextRequest(`http://localhost/api/approvals/inbox?module=${module}`));
  return (await res.json()).data as { id: string; via: string; stepId: string | null; exceptions: string[]; details: Record<string, unknown>; employee: { employeeNumber: string } }[];
};

describeDb("Wave C approval inbox (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WC${sfx}`.toUpperCase()]);
    for (const [id, e] of [[OWNER, "o"], [SUP, "s"], [CLERK, "k"]]) {
      await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'A', 'B', now())`, [id, T, `${e}${sfx}@t.test`]);
    }
    await q(`UPDATE "Tenant" SET "ownerUserId" = $2 WHERE id = $1`, [T, OWNER]);
    await q(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Clerk', now())`, [ROLE, T]);
    await q(`INSERT INTO "Department" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Finance', now())`, [DEPT, T]);
    for (const [id, num, last, user] of [[E.owner, "O-1", "Ocampo", OWNER], [E.sup, "S-1", "Santos", SUP], [E.ana, "A-1", "Abad", null], [E.ben, "B-1", "Bautista", null], [E.cara, "C-1", "Cruz", null]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "userId", "departmentId", "updatedAt") VALUES ($1, $2, $3, 'X', $4, '2025-01-06', $5, $6, now())`, [id, T, num, last, user, DEPT]);
    }
    // Expense claims: one clean, one over the limit with no receipt, one the owner's own.
    const claim = async (key: string, emp: string, cents: number, receipt: string | null, flags: unknown[]) => {
      ids[key] = `wcx${key}${sfx}`;
      await q(`INSERT INTO "ExpenseClaim" (id, "tenantId", "employeeId", category, description, "amountCents", "claimDate", status, "receiptKey", "limitFlags", "updatedAt")
               VALUES ($1, $2, $3, 'TRANSPORT', 'Taxi', $4, '2026-11-10', 'SUBMITTED', $5, $6, now())`, [ids[key], T, emp, cents, receipt, JSON.stringify(flags)]);
    };
    await claim("clean", E.ana, 50000, "r/1.pdf", []);
    await claim("over", E.ben, 250000, null, [{ kind: "PER_CLAIM", limitCents: "100000", amountCents: "250000" }]);
    await claim("own", E.owner, 10000, "r/2.pdf", []);
    // Leave: Ana (chain: Santos), Ben (no chain), Cara approved over the same dates.
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.25, now())`, [LT, T]);
    for (const e of [E.ana, E.ben, E.cara]) {
      await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, "openingBalance", earned, used, "updatedAt") VALUES ($1, $2, $3, $4, 2026, 0, 5, 0, now())`, [`wcb${e}`, T, e, LT]);
    }
    const leave = async (key: string, emp: string, days: number, start: string, end: string, status: string) => {
      ids[key] = `wcv${key}${sfx}`;
      await q(`INSERT INTO "LeaveTransaction" (id, "tenantId", "employeeId", "leaveTypeId", "leaveBalanceId", type, amount, "paidUnits", "startDate", "endDate", "approvalStatus")
               VALUES ($1, $2, $3, $4, $5, 'USAGE', $6, $6, $7, $8, $9::"ApprovalStatus")`, [ids[key], T, emp, LT, `wcb${emp}`, days, start, end, status]);
    };
    await leave("ana", E.ana, 3, "2026-12-01", "2026-12-03", "PENDING");
    await leave("ben", E.ben, 6, "2026-12-10", "2026-12-15", "PENDING");
    await leave("cara", E.cara, 2, "2026-12-02", "2026-12-03", "APPROVED");
    await q(`INSERT INTO "ApprovalStep" (id, "tenantId", module, "entityId", "stepIndex", "roleKey", "approverEmployeeId", "updatedAt") VALUES ($1, $2, 'LEAVE', $3, 0, 'supervisor', $4, now())`, [`wcst${sfx}`, T, ids.ana, E.sup]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["ApprovalStep", "LeaveTransaction", "LeaveBalance", "LeaveType", "ExpenseClaim"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Department" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await q(`UPDATE "Tenant" SET "ownerUserId" = NULL WHERE id = $1`, [T]);
    await q(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 the expense queue", async () => {
    auth.userId = OWNER; auth.roleId = null;
    const items = await list("EXPENSE");
    expect(items.map((i) => i.id).sort()).toEqual([ids.clean, ids.over].sort());
    expect(items.find((i) => i.id === ids.clean)!.exceptions).toEqual(["Its type sets no tax treatment: choose one"]);
    expect(items.find((i) => i.id === ids.over)!.exceptions).toEqual(expect.arrayContaining(["Over the per-claim limit of ₱1,000.00", "No receipt attached"]));
    auth.userId = CLERK; auth.roleId = ROLE;
    expect(await list("EXPENSE")).toEqual([]);
  });

  it("D2 the leave queue", async () => {
    auth.userId = SUP; auth.roleId = ROLE;
    const sup = await list("LEAVE");
    expect(sup.map((i) => [i.id, i.via, !!i.stepId])).toEqual([[ids.ana, "STEP", true]]);
    expect(sup[0]!.details).toMatchObject({ balanceAvailable: "5.00", balanceAfter: "2.00" });
    expect(sup[0]!.exceptions).toEqual(["1 other in the department off on these dates"]);

    auth.userId = OWNER; auth.roleId = null;
    const hr = await list("LEAVE");
    expect(hr.map((i) => [i.id, i.via]).sort()).toEqual([[ids.ana, "HR_OVERRIDE"], [ids.ben, "HR"]].sort());
    expect(hr.find((i) => i.id === ids.ben)!.exceptions).toEqual(["Balance would be -1.00 after the pending requests"]);
  });

  it("D3 sending a claim back", async () => {
    auth.userId = OWNER; auth.roleId = null;
    const res = await sendBack(new NextRequest(`http://localhost/x/${ids.over}/return`, { method: "POST", body: JSON.stringify({ reason: "Attach the receipt" }) }), { params: Promise.resolve({ id: ids.over }) });
    expect(res.status).toBe(200);
    expect((await q(`SELECT status, "rejectionReason" FROM "ExpenseClaim" WHERE id = $1`, [ids.over])).rows[0]).toEqual({ status: "DRAFT", rejectionReason: "Attach the receipt" });
    const own = await sendBack(new NextRequest(`http://localhost/x/${ids.own}/return`, { method: "POST", body: JSON.stringify({ reason: "x" }) }), { params: Promise.resolve({ id: ids.own }) });
    expect(own.status).toBe(403);
  });
});
