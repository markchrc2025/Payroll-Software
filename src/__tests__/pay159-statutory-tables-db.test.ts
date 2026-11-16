/**
 * PAY-159 on a real Postgres, through the real API under row-level security:
 * the Statutory Table page shows the company the tables its payroll uses.
 *
 * Company T has its own SSS rates (2025, ended; 2026, open) and one table for
 * PhilHealth, Pag-IBIG and BIR. Company U has its own SSS rate too.
 *
 *   D1  (T1) on 17 Nov 2026 the SSS table in force is T's 2026 version, the
 *       very rule getActiveRule (the payroll engine's resolver) returns; the
 *       2025 version is earlier; every table comes back with its payload,
 *       version, legal basis and dates.
 *   D2  on 1 Jun 2025 the 2025 version is in force and the 2026 one upcoming.
 *   D3  company U's rate never shows to T (row-level security plus the
 *       query), and U sees its own.
 *   D4  a bad date is refused with 400.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p159t${sfx}`;
const U = `p159u${sfx}`;
const id = (s: string) => `p159${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p159-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));

import { GET } from "@/app/api/payroll/statutory-tables/route";
import { withTenant } from "@/lib/with-tenant";
import { getActiveRule } from "@/lib/statutory/resolver";
import type { StatutoryTablesResponse } from "@/lib/statutory/tables";

type Body = { data: StatutoryTablesResponse; error?: string };
async function tables(asOf: string): Promise<{ status: number; body: Body }> {
  const res = await GET(new NextRequest(`http://test.local/api/payroll/statutory-tables?asOf=${asOf}`));
  return { status: res.status, body: (await res.json()) as Body };
}
const sss = (b: Body) => b.data.tables.find((t) => t.category === "SSS_SCHEDULE")!;

describeDb("PAY-159 statutory tables API (real Postgres, RLS)", () => {
  let admin: pg.Client;
  const q = (sql: string, p: unknown[] = []) => admin.query(sql, p);
  async function rule(
    key: string,
    tenant: string,
    cat: string,
    from: string,
    to: string | null,
    payload: unknown,
  ) {
    await q(
      `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "effectiveTo", "legalBasis", version, payload, "updatedAt")
       VALUES ($1, $2, $3::"StatutoryCategory", $4, $5, $6, $7, $8::jsonb, now())`,
      [id(key), tenant, cat, from, to, `basis ${key}`, `p159-${key}`, JSON.stringify(payload)],
    );
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    for (const [t, code] of [[T, `P159T${sfx}`], [U, `P159U${sfx}`]]) {
      await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [t, code.toUpperCase()]);
    }
    const sss2025 = { rows: SSS.rows.slice(0, 3) };
    await rule("sss2025", T, "SSS_SCHEDULE", "2025-01-01", "2026-01-01", sss2025);
    await rule("sss2026", T, "SSS_SCHEDULE", "2026-01-01", null, SSS);
    await rule("phic", T, "PHILHEALTH_SCHEDULE", "2025-01-01", null, PHIC);
    await rule("pagibig", T, "PAGIBIG_SCHEDULE", "2024-02-01", null, PAGIBIG);
    await rule("bir", T, "BIR_WITHHOLDING_TABLE", "2023-01-01", null, BIR);
    await rule("usss", U, "SSS_SCHEDULE", "2026-06-01", null, SSS);
  });

  afterAll(async () => {
    await q(`DELETE FROM "StatutoryRule" WHERE "tenantId" IN ($1, $2)`, [T, U]);
    await q(`DELETE FROM "Tenant" WHERE id IN ($1, $2)`, [T, U]);
    await admin.end();
  });

  it("D1 (T1) the SSS table in force is the rule the payroll engine resolves", async () => {
    auth.tenantId = T;
    const { status, body } = await tables("2026-11-17");
    expect(status).toBe(200);
    expect(body.data.asOf).toBe("2026-11-17");
    expect(body.data.tables.map((t) => t.key)).toEqual(["sss", "philhealth", "pagibig", "bir"]);

    const engine = await withTenant(T, (tx) => getActiveRule(tx, T, "SSS_SCHEDULE", new Date("2026-11-17T00:00:00.000Z")));
    expect(engine.id).toBe(id("sss2026"));
    const mine = sss(body).versions.filter((v) => v.id.startsWith("p159"));
    expect(mine.map((v) => [v.id, v.status])).toEqual([
      [id("sss2026"), "IN_FORCE"],
      [id("sss2025"), "EARLIER"],
    ]);
    expect(sss(body).versions.filter((v) => v.status === "IN_FORCE").map((v) => v.id)).toEqual([engine.id]);

    const v2026 = mine[0]!;
    expect(v2026).toMatchObject({
      version: "p159-sss2026",
      legalBasis: "basis sss2026",
      effectiveFrom: "2026-01-01",
      lastDay: null,
      companyRate: true,
    });
    expect(v2026.payload).toEqual(SSS);
    expect(mine[1]).toMatchObject({ effectiveFrom: "2025-01-01", lastDay: "2025-12-31" });

    for (const [cat, key, payload] of [
      ["PHILHEALTH_SCHEDULE", "phic", PHIC],
      ["PAGIBIG_SCHEDULE", "pagibig", PAGIBIG],
      ["BIR_WITHHOLDING_TABLE", "bir", BIR],
    ] as const) {
      const t = body.data.tables.find((x) => x.category === cat)!;
      const inForce = t.versions.find((v) => v.status === "IN_FORCE")!;
      expect(inForce.id, cat).toBe(id(key));
      expect(inForce.payload, cat).toEqual(payload);
    }
  });

  it("D2 on an earlier date the earlier version is in force and the later one upcoming", async () => {
    auth.tenantId = T;
    const { body } = await tables("2025-06-01");
    const mine = sss(body).versions.filter((v) => v.id.startsWith("p159"));
    expect(mine.map((v) => [v.id, v.status])).toEqual([
      [id("sss2026"), "UPCOMING"],
      [id("sss2025"), "IN_FORCE"],
    ]);
    expect(mine[1]!.payload).toEqual({ rows: SSS.rows.slice(0, 3) });
  });

  it("D3 another company's rate never shows, and that company sees its own", async () => {
    auth.tenantId = T;
    const t = await tables("2026-11-17");
    expect(sss(t.body).versions.some((v) => v.id === id("usss"))).toBe(false);

    auth.tenantId = U;
    const u = await tables("2026-11-17");
    const ids = sss(u.body).versions.map((v) => v.id);
    expect(ids).toContain(id("usss"));
    expect(ids).not.toContain(id("sss2026"));
    expect(ids).not.toContain(id("sss2025"));
    expect(sss(u.body).versions.find((v) => v.id === id("usss"))!.status).toBe("IN_FORCE");
  });

  it("D4 a bad date is refused", async () => {
    auth.tenantId = T;
    for (const bad of ["2026-13-01", "17-11-2026", "soon"]) {
      const { status } = await tables(bad);
      expect(status, bad).toBe(400);
    }
  });
});
