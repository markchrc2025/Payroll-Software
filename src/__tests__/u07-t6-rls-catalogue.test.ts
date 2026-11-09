/**
 * Unit 0.7, T6 — every table carrying tenantId has the full RLS shape.
 *
 * Catches a future migration that adds a tenant table without RLS. The rule is
 * hand-written here (REP-2), not read from any migration:
 *
 *   T6a  relrowsecurity AND relforcerowsecurity.
 *   T6b  a tenant_isolation policy whose expression compares "tenantId" with
 *        current_setting('app.current_tenant_id', ...). A policy merely NAMED
 *        tenant_isolation with USING (true) must not pass.
 *   T6c  an admin_bypass policy, so prismaAdmin (the table owner) keeps its
 *        cross-tenant reach once the owner is not a superuser.
 *   T6d  no permissive USING (true) policy applies to PUBLIC: that would let
 *        every role, payroll_app included, bypass isolation.
 *
 * Seen to fail first on a database without
 * 20261110000100_rls_catalogue_completion (32 tables short of the shape).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

/** Hand-written floor: 69 tenant tables at 10 Nov 2026. Fewer means the catalogue query broke. */
const MIN_TENANT_TABLES = 69;

type Row = {
  t: string;
  rls: boolean;
  forced: boolean;
  iso: string | null;
  bypass: boolean;
};

describeDb("unit 0.7 T6 — RLS shape on every tenant table", () => {
  let c: pg.Client;
  let rows: Row[];

  beforeAll(async () => {
    c = new pg.Client({ connectionString: DB });
    await c.connect();
    rows = (
      await c.query<Row>(`
        SELECT c.relname AS t,
               c.relrowsecurity AS rls,
               c.relforcerowsecurity AS forced,
               (SELECT p.qual FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname
                   AND p.policyname = 'tenant_isolation') AS iso,
               EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname
                          AND p.policyname = 'admin_bypass') AS bypass
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped)
         ORDER BY 1`)
    ).rows;
  });

  afterAll(async () => {
    await c.end();
  });

  it("finds the tenant tables at all (vacuity guard)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(MIN_TENANT_TABLES);
  });

  it("T6a every tenant table has RLS enabled AND forced", () => {
    expect(rows.filter((r) => !(r.rls && r.forced)).map((r) => r.t)).toEqual([]);
  });

  it("T6b every tenant table has a tenant_isolation policy on tenantId = app.current_tenant_id", () => {
    const bad = rows
      .filter(
        (r) =>
          !r.iso ||
          !/"tenantId" = current_setting\('app\.current_tenant_id'::text, true\)/.test(r.iso),
      )
      .map((r) => `${r.t}: ${r.iso ?? "(none)"}`);
    expect(bad).toEqual([]);
  });

  it("T6c every tenant table has an admin_bypass policy", () => {
    expect(rows.filter((r) => !r.bypass).map((r) => r.t)).toEqual([]);
  });

  it("T6d no USING (true) policy applies to PUBLIC", async () => {
    const { rows: open } = await c.query(
      `SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
          AND qual = 'true' AND 'public' = ANY (roles)`,
    );
    expect(open).toEqual([]);
  });
});
