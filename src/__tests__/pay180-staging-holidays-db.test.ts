/**
 * PAY-180 (staging chain test, 17 Nov 2026): staging had no Philippine
 * holidays, so holiday pay could not be tested there. The staging seed now
 * loads the 2026 national holidays of Proclamation No. 1006 (Section 1 A, B
 * and D) through the app's own bulk endpoint.
 *
 *   H1  (T1) the list matches the proclamation: 10 regular holidays and 8
 *       special (non-working) days, with the right dates.
 *   H2  the real bulk endpoint accepts all of them, and a second load skips
 *       every one (a kept staging database is seeded again on restart).
 *   H3  the seed loads them.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { HOLIDAYS_2026 } from "../../scripts/staging/seed-data.mjs";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p180t${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p180-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));

import { POST as bulk } from "@/app/api/holidays/bulk/route";

describe("PAY-180 the 2026 holidays match Proclamation No. 1006", () => {
  it("H1 (T1) 10 regular holidays and 8 special non-working days, right dates", () => {
    const by = (c: string) => HOLIDAYS_2026.filter((h: { category: string }) => h.category === c).map((h: { date: string }) => h.date).sort();
    expect(by("LEGAL")).toEqual([
      "2026-01-01", "2026-04-02", "2026-04-03", "2026-04-09", "2026-05-01",
      "2026-06-12", "2026-08-31", "2026-11-30", "2026-12-25", "2026-12-30",
    ]);
    expect(by("SPECIAL_NON_WORKING")).toEqual([
      "2026-02-17", "2026-04-04", "2026-08-21", "2026-11-01", "2026-11-02", "2026-12-08", "2026-12-24", "2026-12-31",
    ]);
    expect(HOLIDAYS_2026).toHaveLength(18);
  });

  it("H3 the staging seed loads the missing ones through the bulk endpoint", async () => {
    expect(readFileSync("scripts/staging/seed-data.mjs", "utf8")).toMatch(/api\.must\("POST", "\/api\/holidays\/bulk", \{ rows: missingHolidays \}\)/);
  });
});

describeDb("PAY-180 the bulk endpoint takes the 2026 list (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const post = async () => {
    const res = await bulk(new NextRequest("http://test.local/api/holidays/bulk", { method: "POST", body: JSON.stringify({ rows: HOLIDAYS_2026 }) }));
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P180${sfx}`.toUpperCase()]);
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 300));
    for (const t of ["AuditLog", "Holiday"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("H2 all 18 accepted; a second load skips every one", async () => {
    const first = await post();
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(18);
    const second = await post();
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.skipped).toHaveLength(18);
    const bonifacio = (await q(`SELECT category FROM "Holiday" WHERE "tenantId" = $1 AND date = '2026-11-30'`, [T])).rows;
    expect(bonifacio).toEqual([{ category: "LEGAL" }]);
  });
});
