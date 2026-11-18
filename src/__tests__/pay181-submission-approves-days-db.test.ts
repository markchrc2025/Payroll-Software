/**
 * PAY-181 (found 18 Nov 2026 while preparing the ESS test): HR approves ESS
 * DTR through the submission, but payroll reads DTR days. The submission went
 * to MANAGER_APPROVED while its days stayed PENDING, so ESS attendance was
 * never paid.
 *
 *   S1  (T1) final approval approves every PENDING day of the employee inside
 *       the period; days outside the period, other employees' days and locked
 *       days are left alone.
 *   S2  a period with a missing punch cannot be approved: 409 naming the
 *       dates, and nothing changes (submission and days).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p181t${sfx}`;
const id = (s: string) => `p181${s}${sfx}`;
const A = id("a");
const B = id("b");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p181-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/approvals/second-party", () => ({ requireApprover: vi.fn(async () => ({ ctx: auth })) }));

import { POST as approve } from "@/app/api/dtr/submissions/[id]/approve/route";

describeDb("PAY-181 approving a DTR submission approves its days (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const post = (sub: string) =>
    approve(new NextRequest(`http://test.local/api/dtr/submissions/${sub}/approve`, { method: "POST" }), {
      params: Promise.resolve({ id: sub }),
    });
  async function dayRow(dtrId: string, emp: string, ymd: string, opts: { missing?: boolean; locked?: boolean } = {}) {
    await q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "hasMissingPunch", "isLocked", "updatedAt")
       VALUES ($1, $2, $3, $4::date, 'PRESENT', 480, $5, $6, now())`,
      [dtrId, T, emp, ymd, opts.missing ?? false, opts.locked ?? false],
    );
  }
  async function submission(subId: string, from: string, to: string) {
    await q(
      `INSERT INTO "DTRSubmission" (id, "tenantId", "employeeId", "periodStart", "periodEnd", "updatedAt")
       VALUES ($1, $2, $3, $4::date, $5::date, now())`,
      [subId, T, A, from, to],
    );
  }
  const statusOf = async (dtrId: string) =>
    (await q(`SELECT "approvalStatus" FROM "DTRRecord" WHERE id = $1`, [dtrId])).rows[0].approvalStatus;
  const subStatus = async (subId: string) =>
    (await q(`SELECT status FROM "DTRSubmission" WHERE id = $1`, [subId])).rows[0].status;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P181${sfx}`.toUpperCase()]);
    for (const [e, n] of [[A, "A"], [B, "B"]])
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
         VALUES ($1, $2, $3, 'P181', $4, '2025-01-06', now())`,
        [e, T, `P181${n}-${sfx}`, n],
      );
  });

  afterAll(async () => {
    for (const t of ["DTRRecord", "DTRSubmission", "ApprovalStep"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("S1 (T1) final approval approves the employee's PENDING days inside the period only", async () => {
    await dayRow(id("d1"), A, "2026-11-02");
    await dayRow(id("d2"), A, "2026-11-13");
    await dayRow(id("dl"), A, "2026-11-04", { locked: true });
    await dayRow(id("do"), A, "2026-11-16"); // next cutoff
    await dayRow(id("db"), B, "2026-11-02"); // another employee
    await submission(id("s1"), "2026-11-01", "2026-11-15");

    const res = await post(id("s1"));
    expect(res.status).toBe(200);
    expect(await subStatus(id("s1"))).toBe("MANAGER_APPROVED");
    expect(await statusOf(id("d1"))).toBe("APPROVED");
    expect(await statusOf(id("d2"))).toBe("APPROVED");
    expect(await statusOf(id("dl"))).toBe("PENDING");
    expect(await statusOf(id("do"))).toBe("PENDING");
    expect(await statusOf(id("db"))).toBe("PENDING");
  });

  it("S2 a period with a missing punch is refused, naming the dates, and nothing changes", async () => {
    await dayRow(id("e1"), A, "2026-11-17");
    await dayRow(id("e2"), A, "2026-11-18", { missing: true });
    await submission(id("s2"), "2026-11-16", "2026-11-30");

    const res = await post(id("s2"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.details.missingPunchDates).toEqual(["2026-11-18"]);
    expect(await subStatus(id("s2"))).toBe("SUBMITTED");
    expect(await statusOf(id("e1"))).toBe("PENDING");
    expect(await statusOf(id("do"))).toBe("PENDING");
  });
});
