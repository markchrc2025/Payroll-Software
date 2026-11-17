/**
 * PAY-163 (Mark, 17 Nov 2026 12:36): "latest posted SSS version is right!"
 *
 * Production has two global SSS versions that both start 1 Jan 2026. The
 * payroll's lookup (getActiveRule) ordered by start date only, so the tie was
 * left to Postgres's row order.
 *
 *   T1  two versions with the same start date: the one published last
 *       (createdAt) wins, whichever was inserted first.
 *   T2  a later start date still beats a later publication (effective dating
 *       first, publication only breaks a tie).
 *   T3  the Central Portal's Compliance card uses the same order.
 *
 * Global rows in 2097 and 2098 so no other test's payroll can pick them up;
 * removed afterwards.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { withTenant } from "@/lib/with-tenant";
import { getActiveRule } from "@/lib/statutory/resolver";
import { SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p163t${sfx}`;
const v = (k: string) => `p163-${k}-${sfx}`;

describeDb("PAY-163 same-day statutory versions: latest published wins (real Postgres)", () => {
  let c: pg.Client;
  async function rule(version: string, from: string, createdAt: string) {
    await c.query(
      `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "effectiveTo", "legalBasis", version, payload, "createdAt", "updatedAt")
       VALUES ($1, NULL, 'SSS_SCHEDULE', $2, NULL, 'PAY-163 test', $1, $3::jsonb, $4, now())`,
      [version, from, JSON.stringify(SSS), createdAt],
    );
  }
  const resolve = (asOf: string) =>
    withTenant(T, (tx) => getActiveRule(tx, T, "SSS_SCHEDULE", new Date(`${asOf}T00:00:00.000Z`)));

  beforeAll(async () => {
    c = new pg.Client({ connectionString: DB });
    await c.connect();
    await c.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P163${sfx}`.toUpperCase()]);
  });
  afterAll(async () => {
    await c.query(`DELETE FROM "StatutoryRule" WHERE version LIKE $1`, [`p163-%-${sfx}`]);
    await c.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await c.end();
  });

  it("T1 the version published last wins a same-day tie, whichever row comes first", async () => {
    // 2097: the newer publication is inserted first.
    await rule(v("97-new"), "2097-01-01", "2097-03-01T00:00:00Z");
    await rule(v("97-old"), "2097-01-01", "2097-02-01T00:00:00Z");
    // 2098: the newer publication is inserted second.
    await rule(v("98-old"), "2098-01-01", "2098-02-01T00:00:00Z");
    await rule(v("98-new"), "2098-01-01", "2098-03-01T00:00:00Z");
    expect((await resolve("2097-06-01")).version).toBe(v("97-new"));
    expect((await resolve("2098-06-01")).version).toBe(v("98-new"));
  });

  it("T2 a later start date beats a later publication", async () => {
    // Published before the 2098 pair, but starts later: it wins from its start.
    await rule(v("98-jul"), "2098-07-01", "2098-01-15T00:00:00Z");
    expect((await resolve("2098-06-30")).version).toBe(v("98-new"));
    expect((await resolve("2098-07-01")).version).toBe(v("98-jul"));
  });

  it("T3 the Compliance card orders versions the same way", () => {
    const page = readFileSync("src/app/centralportal/(protected)/compliance/page.tsx", "utf8");
    expect(page).toMatch(/orderBy: \[\{ effectiveFrom: "desc" \}, \{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
    const resolver = readFileSync("src/lib/statutory/resolver.ts", "utf8");
    expect(resolver).toMatch(/orderBy: \[\{ effectiveFrom: "desc" \}, \{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  });
});
