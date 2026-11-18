/**
 * PAY-178 (staging chain test, 17 Nov 2026): DTR days from the biometric
 * import or the kiosk had no way to be approved in the app (HR approves only
 * ESS submissions), and one-at-a-time approval is not workable.
 *
 *   B1  (T1) every PENDING day in the range is approved in one call, for all
 *       employees; days outside the range stay PENDING.
 *   B2  a day with a missing punch is skipped and listed (PAY-177 rule).
 *   B3  the approver's own days are skipped (no self-approval); locked and
 *       already-decided days are left alone.
 *   B4  employeeIds limits the approval to those employees; a range over 62
 *       days is refused.
 *   B5  the DTR tab has the Approve days button.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p178t${sfx}`;
const id = (s: string) => `p178${s}${sfx}`;
const A = id("a"); // employee A
const B = id("b"); // employee B
const H = id("h"); // the approver's own employee record
const U = id("u"); // the approver's user

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));

import { POST } from "@/app/api/dtr/bulk-approve/route";

describeDb("PAY-178 approve DTR days in bulk (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const day = (key: string, emp: string, ymd: string, o: { missing?: boolean; locked?: boolean; status?: string } = {}) =>
    q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "hasMissingPunch", "isLocked", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4::date, 'PRESENT', 480, $5, $6, $7, now())`,
      [id(key), T, emp, ymd, o.missing ?? false, o.locked ?? false, o.status ?? "PENDING"],
    );
  const status = async (key: string) => (await q(`SELECT "approvalStatus" FROM "DTRRecord" WHERE id = $1`, [id(key)])).rows[0].approvalStatus;
  const post = async (body: unknown) => {
    const res = await POST(new NextRequest("http://test.local/api/dtr/bulk-approve", { method: "POST", body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P178${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'HR', 'Test', now())`, [U, T, `p178-${sfx}@test.local`]);
    for (const [e, n, user] of [[A, "A", null], [B, "B", null], [H, "H", U]] as const)
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "userId", "updatedAt")
         VALUES ($1, $2, $3, 'P178', $4, '2025-01-06', $5, now())`,
        [e, T, `P178${n}-${sfx}`, n, user],
      );
    await day("a1", A, "2026-11-02");
    await day("a2", A, "2026-11-03");
    await day("a3", A, "2026-11-04", { missing: true });
    await day("a4", A, "2026-11-20"); // outside the range
    await day("b1", B, "2026-11-02");
    await day("b2", B, "2026-11-03", { locked: true });
    await day("b3", B, "2026-11-05", { status: "REJECTED" });
    await day("h1", H, "2026-11-02");
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 300));
    for (const t of ["AuditLog", "DTRRecord"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("B4a a range over 62 days is refused", async () => {
    const r = await post({ from: "2026-09-01", to: "2026-11-15" });
    expect(r.status).toBe(422);
  });

  it("B4b employeeIds limits the approval to those employees", async () => {
    const r = await post({ from: "2026-11-01", to: "2026-11-15", employeeIds: [B] });
    expect(r.status).toBe(200);
    expect(r.body.data.approved).toBe(1);
    expect(await status("b1")).toBe("APPROVED");
    expect(await status("a1")).toBe("PENDING");
  });

  it("B1 (T1) every pending day in the range is approved in one call", async () => {
    const r = await post({ from: "2026-11-01", to: "2026-11-15" });
    expect(r.status).toBe(200);
    expect(r.body.data.approved).toBe(2);
    expect(await status("a1")).toBe("APPROVED");
    expect(await status("a2")).toBe("APPROVED");
    expect(await status("a4")).toBe("PENDING");
  });

  it("B2 a day with a missing punch is skipped and listed", async () => {
    expect(await status("a3")).toBe("PENDING");
    const r = await post({ from: "2026-11-01", to: "2026-11-15" });
    expect(r.body.data.skippedMissingPunch).toEqual([
      { employeeId: A, employeeNumber: `P178A-${sfx}`, name: "P178 A", date: "2026-11-04" },
    ]);
  });

  it("B3 own days skipped; locked and decided days left alone", async () => {
    const r = await post({ from: "2026-11-01", to: "2026-11-15" });
    expect(r.body.data.skippedOwn).toBe(1);
    expect(await status("h1")).toBe("PENDING");
    expect(await status("b2")).toBe("PENDING");
    expect(await status("b3")).toBe("REJECTED");
  });

  it("B5 the DTR tab has the Approve days button", () => {
    expect(readFileSync("src/components/attendance/DtrRecordsTab.tsx", "utf8")).toMatch(/<BulkApproveDaysDialog /);
  });
});
