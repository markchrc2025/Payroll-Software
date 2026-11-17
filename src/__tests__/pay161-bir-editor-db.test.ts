/**
 * PAY-161 on a real Postgres, through the publish API the BIR editor calls
 * (POST /api/admin/statutory/bir), as a Sentire admin.
 *
 *   D1  a valid table publishes, and from its start date the payroll's
 *       own resolver (getActiveRule) picks it for a company with no rate of
 *       its own; its tax is what the table says (semi-monthly ₱20,000.00:
 *       ₱937.50 + 20% of ₱3,333.00 = ₱1,604.10).
 *   D2  (T1) a table whose brackets are out of order is refused with the
 *       reason, and nothing is stored. Before PAY-161 the API stored it (201).
 *   D3  a table without a weekly part is refused (weekly payrolls could not
 *       run), and nothing is stored. Before PAY-161 the API stored it (201).
 *   D4  someone who is not a Sentire admin is refused, and nothing is stored.
 *
 * The versions start in 2099 so no other test's payroll can pick them up;
 * they are removed afterwards.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p161t${sfx}`;
const V = (k: string) => `p161-${k}-${sfx}`;

const admin = vi.hoisted(() => ({ ctx: { userId: "p161-sentire-admin" } as { userId: string } | null }));
vi.mock("@/lib/super-admin-auth", () => ({ getSuperAdminContext: vi.fn(async () => admin.ctx) }));
// The publish API files its audit entry under the oldest active company, which
// in a shared test database can be another test's company (its cleanup would
// then fail on the foreign key). Stub the writer, as other DB tests do, and
// assert the call instead.
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.9" }));

import { POST } from "@/app/api/admin/statutory/bir/route";
import { writeAuditLog } from "@/lib/audit";
import { withTenant } from "@/lib/with-tenant";
import { getActiveRule } from "@/lib/statutory/resolver";
import { lookupBIR } from "@/lib/statutory/compute";

const SEMI = [
  { floor: 0, fixedTax: 0, plusRate: 0 },
  { floor: 1041700, fixedTax: 0, plusRate: 0.15 },
  { floor: 1666700, fixedTax: 93750, plusRate: 0.2 },
  { floor: 3333300, fixedTax: 427080, plusRate: 0.25 },
];
const table = (over: Record<string, unknown> = {}) => ({
  frequencies: {
    DAILY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 68500, fixedTax: 0, plusRate: 0.15 }],
    WEEKLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 480800, fixedTax: 0, plusRate: 0.15 }],
    SEMI_MONTHLY: SEMI,
    MONTHLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 2083300, fixedTax: 0, plusRate: 0.15 }],
    ...over,
  },
});
async function publish(version: string, payload: unknown) {
  const res = await POST(
    new NextRequest("http://test.local/api/admin/statutory/bir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version,
        effectiveFrom: "2099-01-01T00:00:00.000Z",
        legalBasis: "PAY-161 test table",
        payload,
      }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { error?: string; details?: { problems?: string[] } } };
}

describeDb("PAY-161 BIR editor publish API (real Postgres)", () => {
  let pgc: pg.Client;
  const stored = async (version: string) =>
    (await pgc.query(`SELECT count(*)::int AS n FROM "StatutoryRule" WHERE version = $1`, [version])).rows[0].n as number;

  beforeAll(async () => {
    pgc = new pg.Client({ connectionString: DB });
    await pgc.connect();
    await pgc.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [
      T,
      `P161${sfx}`.toUpperCase(),
    ]);
  });

  afterAll(async () => {
    await pgc.query(`DELETE FROM "StatutoryRule" WHERE version LIKE $1`, [`p161-%-${sfx}`]);
    await pgc.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await pgc.end();
  });

  it("D1 a valid table publishes and the payroll uses it from its start date", async () => {
    admin.ctx = { userId: "p161-sentire-admin" };
    const r = await publish(V("ok"), table());
    expect(r.status).toBe(201);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "p161-sentire-admin",
        action: "CREATE",
        entity: "StatutoryRule",
        changes: { category: "BIR_WITHHOLDING_TABLE", version: V("ok") },
      }),
    );

    const rule = await withTenant(T, (tx) =>
      getActiveRule(tx, T, "BIR_WITHHOLDING_TABLE", new Date("2099-06-30T00:00:00.000Z")),
    );
    expect(rule.version).toBe(V("ok"));
    expect(rule.payload.frequencies.SEMI_MONTHLY).toEqual(SEMI);
    expect(lookupBIR(rule.payload, "SEMI_MONTHLY", 2000000n).tax).toBe(160410n);
    // The day before it starts, the payroll still uses the earlier table.
    const before = await withTenant(T, (tx) =>
      getActiveRule(tx, T, "BIR_WITHHOLDING_TABLE", new Date("2098-12-31T00:00:00.000Z")).catch(() => null),
    );
    expect(before?.version).not.toBe(V("ok"));
  });

  it("D2 (T1) brackets out of order are refused with the reason, and nothing is stored", async () => {
    admin.ctx = { userId: "p161-sentire-admin" };
    const bad = [SEMI[0], SEMI[2], SEMI[1], SEMI[3]];
    const r = await publish(V("order"), table({ SEMI_MONTHLY: bad }));
    expect(r.status).toBe(400);
    expect(r.body.details?.problems).toContain(
      'Semi-monthly, bracket 3: "From" ₱10,417.00 must be above bracket 2\'s ₱16,667.00.',
    );
    expect(await stored(V("order"))).toBe(0);
  });

  it("D3 a table without a weekly part is refused, and nothing is stored", async () => {
    admin.ctx = { userId: "p161-sentire-admin" };
    const r = await publish(V("noweekly"), table({ WEEKLY: undefined }));
    expect(r.status).toBe(400);
    expect(r.body.details?.problems).toEqual(["Weekly: add at least one bracket."]);
    expect(await stored(V("noweekly"))).toBe(0);
  });

  it("D4 someone who is not a Sentire admin is refused", async () => {
    admin.ctx = null;
    vi.mocked(writeAuditLog).mockClear();
    const r = await publish(V("noadmin"), table());
    expect(r.status).toBe(401);
    expect(await stored(V("noadmin"))).toBe(0);
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });
});
