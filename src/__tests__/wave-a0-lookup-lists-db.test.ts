/**
 * Wave A against real Postgres.
 *
 *   D1  a list starts with its defaults once; an empty list stays empty
 *       (fails on main: no lists).
 *   D2  adding and changing items: codes checked, no duplicate codes, fields
 *       checked; built-in items keep their code and cannot be deleted; a
 *       switched-off item drops out of pickers.
 *   D3  one company never sees another's items.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const A = `wa0a${sfx}`;
const B = `wa0b${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { GET, POST } from "@/app/api/lookups/[list]/route";
import { DELETE, PATCH } from "@/app/api/lookups/[list]/[id]/route";

const p = (list: string) => ({ params: Promise.resolve({ list }) });
const pi = (list: string, id: string) => ({ params: Promise.resolve({ list, id }) });
const r = (body?: unknown, method = "GET", qs = "") => new NextRequest(`http://localhost/api/lookups${qs}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });
const items = async (list: string, qs = "") => (await (await GET(r(undefined, "GET", qs), p(list))).json()).data.items as { id: string; code: string; isActive: boolean; isSystem: boolean }[];

describeDb("Wave A lists (real Postgres)", () => {
  let admin: pg.Client;
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    for (const t of [A, B]) await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Lists Co', $2, now())`, [t, t.toUpperCase()]);
  });
  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DELETE FROM "LookupItem" WHERE "tenantId" = ANY($1)`, [[A, B]]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[A, B]]);
    await admin.end();
  });

  it("D1 defaults once", async () => {
    auth.tenantId = A;
    const banks = await items("BANK");
    expect(banks.map((b) => b.code)).toContain("GCASH");
    expect((await items("BANK")).length).toBe(banks.length);
    expect(await items("COURSE")).toEqual([]);
    expect((await GET(r(), p("NOPE"))).status).toBe(404);
  });

  it("D2 adding and changing", async () => {
    auth.tenantId = A;
    expect((await POST(r({ code: "bad code!", name: "X" }, "POST"), p("COURSE"))).status).toBe(422);
    const ok = await POST(r({ code: "osh8", name: "Occupational safety and health, 8 hours", attributes: { defaultHours: 8, junk: true } }, "POST"), p("COURSE"));
    expect(ok.status).toBe(201);
    const course = (await ok.json()).data;
    expect(course).toMatchObject({ code: "OSH8", attributes: { defaultHours: 8 } });
    expect((await POST(r({ code: "OSH8", name: "Again" }, "POST"), p("COURSE"))).status).toBe(409);
    expect((await POST(r({ code: "FUEL", name: "Fuel", attributes: { limitPerClaimCents: "12.50" } }, "POST"), p("EXPENSE_CATEGORY"))).status).toBe(422);
    const cats = await items("DOCUMENT_CATEGORY");
    const contract = cats.find((c) => c.code === "CONTRACT")!;
    expect((await PATCH(r({ code: "CONTRACTS" }, "PATCH"), pi("DOCUMENT_CATEGORY", contract.id))).status).toBe(409);
    expect((await DELETE(r(undefined, "DELETE"), pi("DOCUMENT_CATEGORY", contract.id))).status).toBe(409);
    expect((await PATCH(r({ isActive: false }, "PATCH"), pi("DOCUMENT_CATEGORY", contract.id))).status).toBe(200);
    expect((await items("DOCUMENT_CATEGORY")).map((c) => c.code)).not.toContain("CONTRACT");
    expect((await items("DOCUMENT_CATEGORY", "?includeInactive=1")).map((c) => c.code)).toContain("CONTRACT");
    expect((await DELETE(r(undefined, "DELETE"), pi("COURSE", course.id))).status).toBe(200);
    expect(await items("COURSE")).toEqual([]);
  });

  it("D3 companies apart", async () => {
    auth.tenantId = B;
    expect((await items("DOCUMENT_CATEGORY")).map((c) => c.code)).toContain("CONTRACT");
    const n = (await admin.query(`SELECT count(*)::int n FROM "LookupItem" WHERE "tenantId" = $1 AND list = 'COURSE'`, [B])).rows[0].n;
    expect(n).toBe(0);
  });
});
