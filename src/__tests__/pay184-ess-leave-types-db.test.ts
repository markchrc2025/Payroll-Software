/**
 * PAY-184 (ESS sandbox test, 18 Nov 2026): leave could not be filed in ESS.
 * The leave forms list the types from /api/ess/leave-balances, which returned
 * only types the employee already had a balance row for, so a new employee
 * (or a type HR just added) had nothing to pick, although POST /api/ess/leaves
 * creates the balance itself.
 *
 *   L1  (T1) every active leave type is offered: one with a balance comes
 *       back as is; one without comes back as a zero balance; an inactive or
 *       deleted type is not offered.
 *   L2  filing leave on an offered type works (201) and creates the balance.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p184t${sfx}`;
const id = (s: string) => `p184${s}${sfx}`;
const A = id("a");

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));
vi.mock("@/lib/cache/cache", () => ({ getOrSet: vi.fn(async (_k: string, _t: number, f: () => unknown) => f()) }));

import { GET as balances } from "@/app/api/ess/leave-balances/route";
import { POST as fileLeave } from "@/app/api/ess/leaves/route";

type Row = { id: string; leaveTypeId: string; earned: string; leaveType: { code: string } };

describeDb("PAY-184 ESS offers every active leave type (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const list = async () =>
    ((await (await balances(new NextRequest("http://test.local/api/ess/leave-balances?year=2026"))).json()).data as Row[]);
  const type = (key: string, code: string, extra = "") =>
    q(
      `INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt"${extra ? ", " + extra.split("=")[0] : ""})
       VALUES ($1, $2, $3, $3, 1, now()${extra ? ", " + extra.split("=")[1] : ""})`,
      [id(key), T, code],
    );

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    ess.employeeId = A;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P184${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P184', 'Test', '2025-01-06', now())`,
      [A, T, `P184-${sfx}`],
    );
    await type("vl", "VL");
    await type("sil", "SIL");
    await type("old", "OLD", `"isActive"=false`);
    await type("gone", "GONE", `"deletedAt"=now()`);
    await q(
      `INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, earned, "updatedAt")
       VALUES ($1, $2, $3, $4, 2026, 3, now())`,
      [id("b"), T, A, id("vl")],
    );
  });

  afterAll(async () => {
    for (const t of ["LeaveTransaction", "LeaveBalance", "LeaveType"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("L1 (T1) every active leave type is offered; one without a balance as zero", async () => {
    const rows = await list();
    expect(rows.map((r) => r.leaveType.code).sort()).toEqual(["SIL", "VL"]);
    const vl = rows.find((r) => r.leaveType.code === "VL")!;
    expect([vl.id, vl.earned]).toEqual([id("b"), "3"]);
    const sil = rows.find((r) => r.leaveType.code === "SIL")!;
    expect([sil.id, sil.leaveTypeId, sil.earned]).toEqual([`new-${id("sil")}`, id("sil"), "0"]);
  });

  it("L2 filing leave on the type with no balance works and creates the balance", async () => {
    const res = await fileLeave(
      new NextRequest("http://test.local/api/ess/leaves", {
        method: "POST",
        body: JSON.stringify({ leaveTypeId: id("sil"), startDate: "2026-11-20", endDate: "2026-11-20", amount: 1, dayPortion: "FULL", reason: "PAY-184" }),
      }),
    );
    expect(res.status).toBe(201);
    const bal = await q(`SELECT count(*) FROM "LeaveBalance" WHERE "employeeId" = $1 AND "leaveTypeId" = $2`, [A, id("sil")]);
    expect(Number(bal.rows[0].count)).toBe(1);
    expect((await list()).find((r) => r.leaveType.code === "SIL")!.id).not.toMatch(/^new-/);
  });
});
