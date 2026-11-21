/**
 * PAY-145 against real Postgres.
 *
 *   D1  a good file sets each opening balance; earned and used are not
 *       touched; a second import replaces (fails on main: no route).
 *   D2  all or nothing: one bad row (unknown employee, unknown leave type,
 *       duplicate) and nothing is saved, every problem listed by row.
 *   D3  HR cannot set their own balance through the import.
 *   D4  the template lists every active employee and leave type with the
 *       balance on file.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p145t${sfx}`;
const U = `p145u${sfx}`;
const E = { ana: `p145a${sfx}`, ben: `p145b${sfx}`, hr: `p145h${sfx}` };
const LT = { vl: `p145v${sfx}`, sl: `p145s${sfx}` };

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));

import { GET, POST } from "@/app/api/leave-balances/import/route";

const post = (csv: string) => {
  const fd = new FormData();
  fd.append("file", new File([csv], "balances.csv", { type: "text/csv" }));
  return POST(new NextRequest("http://localhost/api/leave-balances/import", { method: "POST", body: fd }));
};
const HEAD = "employee_number,leave_type_code,year,opening_balance\n";

describeDb("PAY-145 leave balance import (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const bal = async (emp: string, lt: string) =>
    (await q(`SELECT "openingBalance"::text o, earned::text e, used::text u FROM "LeaveBalance" WHERE "employeeId"=$1 AND "leaveTypeId"=$2 AND year=2026`, [emp, lt])).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `P145${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'HR', now())`, [U, T, `hr${sfx}@t.test`]);
    for (const [id, num, user] of [[E.ana, "A-1", null], [E.ben, "B-2", null], [E.hr, "H-9", U]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "userId", "updatedAt") VALUES ($1, $2, $3, 'X', 'Y', '2025-01-06', $4, now())`, [id, T, num, user]);
    }
    await q(`INSERT INTO "LeaveType" (id, "tenantId", name, code, "accrualAmount", "updatedAt") VALUES ($1, $2, 'Vacation', 'VL', 1.25, now()), ($3, $2, 'Sick', 'SL', 1.25, now())`, [LT.vl, T, LT.sl]);
    await q(`INSERT INTO "LeaveBalance" (id, "tenantId", "employeeId", "leaveTypeId", year, "openingBalance", earned, used, "updatedAt") VALUES ($1, $2, $3, $4, 2026, 1, 3.75, 2, now())`, [`p145lb${sfx}`, T, E.ana, LT.vl]);
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "LeaveBalance" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "LeaveType" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 sets opening balances, keeps earned and used, replaces on a second import", async () => {
    const res = await post(`${HEAD}A-1,VL,2026,7.5\nA-1,sl,2026,"1,000.25"\nB-2,VL,2026,0\n`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ created: 2, replaced: 1 });
    expect(await bal(E.ana, LT.vl)).toEqual({ o: "7.5000", e: "3.7500", u: "2.0000" });
    expect((await bal(E.ana, LT.sl)).o).toBe("1000.2500");
    expect((await bal(E.ben, LT.vl)).o).toBe("0.0000");
    const again = await post(`${HEAD}A-1,VL,2026,6\n`);
    expect((await again.json()).data).toEqual({ created: 0, replaced: 1 });
    expect(await bal(E.ana, LT.vl)).toEqual({ o: "6.0000", e: "3.7500", u: "2.0000" });
  });

  it("D2 all or nothing", async () => {
    const res = await post(`${HEAD}B-2,SL,2026,4\nZ-0,VL,2026,1\nB-2,XX,2026,1\nB-2,sl,2026,5\nB-2,VL,2026,-1\n`);
    expect(res.status).toBe(422);
    const problems = (await res.json()).details.problems as { row: number; errors: string[] }[];
    expect(problems.map((p) => p.row)).toEqual([3, 4, 5, 6]);
    expect(problems[0]!.errors[0]).toContain("No employee with number Z-0");
    expect(problems[1]!.errors[0]).toContain("No leave type with code XX");
    expect(problems[2]!.errors[0]).toContain("Duplicate: row 2");
    expect(problems[3]!.errors[0]).toContain("opening_balance");
    expect(await bal(E.ben, LT.sl)).toBeUndefined();
  });

  it("D3 never one's own balance", async () => {
    const res = await post(`${HEAD}H-9,VL,2026,30\n`);
    expect(res.status).toBe(422);
    expect((await res.json()).details.problems[0].errors).toContain("You cannot set your own leave balance");
    expect(await bal(E.hr, LT.vl)).toBeUndefined();
  });

  it("D4 the template", async () => {
    const res = await GET(new NextRequest("http://localhost/api/leave-balances/import?year=2026"));
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toBe("employee_number,leave_type_code,year,opening_balance");
    expect(lines).toContain("A-1,VL,2026,6");
    expect(lines).toContain("A-1,SL,2026,1000.25");
    expect(lines).toContain("B-2,SL,2026,0");
    expect(lines).toHaveLength(1 + 3 * 2);
  });
});
