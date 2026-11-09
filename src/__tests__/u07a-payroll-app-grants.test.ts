/**
 * Unit 0.7, stop-check A1: payroll_app holds the grants the runtime needs.
 *
 * Migration 20261110000000_payroll_app_runtime_grants grants the whole public
 * schema once and sets DEFAULT PRIVILEGES. Before it, payroll_app had full
 * SELECT/INSERT/UPDATE/DELETE on 35 of 78 tables, so moving the runtime client
 * onto payroll_app would have broken 43 tables with "permission denied".
 *
 * The expectation is hand-written (REP-2): EVERY public table except
 * _prisma_migrations, all four verbs. It is not read from any GRANT list.
 *
 *   G1  every public table: SELECT, INSERT, UPDATE and DELETE (each checked).
 *   G2  _prisma_migrations: no privilege at all.
 *   G3  a table created AFTER the migration, by the migrating role, is
 *       covered automatically (default privileges), so a future migration
 *       cannot reopen the gap by forgetting a GRANT.
 *   G4  USAGE on schema public.
 *
 * Needs TEST_DATABASE_URL as the role that runs migrations (CI: postgres).
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const VERBS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

describeDb("unit 0.7 A1: payroll_app grants", () => {
  let c: pg.Client;
  const probeTable = `u07a_probe_${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    c = new pg.Client({ connectionString: DB });
    await c.connect();
  });

  afterAll(async () => {
    await c.query(`DROP TABLE IF EXISTS public."${probeTable}"`);
    await c.end();
  });

  it("G1 every public table grants payroll_app all four verbs", async () => {
    const { rows } = await c.query<{ relname: string; verb: string }>(
      `SELECT c.relname, v.verb
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN unnest($1::text[]) AS v(verb)
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
          AND NOT has_table_privilege('payroll_app', c.oid, v.verb)
        ORDER BY 1, 2`,
      [VERBS],
    );
    const tables = await c.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
    );
    // Vacuity guard: an empty schema would pass the check below trivially.
    expect(tables.rows[0].n).toBeGreaterThan(50);
    expect(rows.map((r) => `${r.relname}:${r.verb}`)).toEqual([]);
  });

  it("G2 _prisma_migrations grants payroll_app nothing", async () => {
    const { rows } = await c.query(
      `SELECT has_table_privilege('payroll_app', '"_prisma_migrations"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any`,
    );
    expect(rows[0].any).toBe(false);
  });

  it("G3 a table created later by the migrating role is covered by default privileges", async () => {
    await c.query(`CREATE TABLE public."${probeTable}" (id int PRIMARY KEY)`);
    for (const verb of VERBS) {
      const { rows } = await c.query(`SELECT has_table_privilege('payroll_app', $1, $2) AS ok`, [
        `public."${probeTable}"`,
        verb,
      ]);
      expect({ verb, ok: rows[0].ok }).toEqual({ verb, ok: true });
    }
  });

  it("G4 payroll_app can use schema public", async () => {
    const { rows } = await c.query(`SELECT has_schema_privilege('payroll_app', 'public', 'USAGE') AS ok`);
    expect(rows[0].ok).toBe(true);
  });
});
