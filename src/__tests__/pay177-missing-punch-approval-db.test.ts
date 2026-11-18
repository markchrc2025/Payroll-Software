/**
 * PAY-177 (staging chain test, 17 Nov 2026): a DTR day with a missing punch
 * could be approved, which sent it to payroll as 0 worked minutes.
 *
 *   A1  (T1) approving a day with a missing punch is refused (409) and the
 *       day stays PENDING.
 *   A2  the same day approves once the flag is cleared (the punch was fixed).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p177t${sfx}`;
const id = (s: string) => `p177${s}${sfx}`;
const A = id("a");
const D = id("d");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p177-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));

import { POST as approve } from "@/app/api/dtr/[id]/approve/route";

describeDb("PAY-177 a day with a missing punch cannot be approved (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const status = async () => (await q(`SELECT "approvalStatus" FROM "DTRRecord" WHERE id = $1`, [D])).rows[0].approvalStatus;
  const post = () =>
    approve(new NextRequest(`http://test.local/api/dtr/${D}/approve`, { method: "POST" }), { params: Promise.resolve({ id: D }) });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P177${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P177', 'Test', '2025-01-06', now())`,
      [A, T, `P177-${sfx}`],
    );
    await q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "hasMissingPunch", "updatedAt")
       VALUES ($1, $2, $3, '2026-11-02'::date, 'PRESENT', 0, true, now())`,
      [D, T, A],
    );
  });

  afterAll(async () => {
    await q(`DELETE FROM "DTRRecord" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("A1 (T1) approving a day with a missing punch is refused and the day stays PENDING", async () => {
    const res = await post();
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/missing punch/i);
    expect(await status()).toBe("PENDING");
  });

  it("A2 once the punch is fixed the day approves", async () => {
    await q(`UPDATE "DTRRecord" SET "hasMissingPunch" = false, "workedMinutes" = 480 WHERE id = $1`, [D]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await status()).toBe("APPROVED");
  });
});
