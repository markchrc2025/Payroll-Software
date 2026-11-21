/**
 * PAY-204, ruling 2: the leftover rls_auto_enable() function and the extra
 * partial unique index on ApprovalWorkflow are dropped by migration once
 * nothing calls the function (checked on the production drift report, 21 Nov).
 *
 *   D1  on a database that has both (production's shape), the migration
 *       drops both and keeps the full unique index on ("tenantId", code)
 *       (fails on main: no such migration).
 *   D2  run again, or on a database built from the migrations, it changes
 *       nothing.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const SQL = () => readFileSync("prisma/migrations/20261121000700_pay204_drop_drift_objects/migration.sql", "utf8");

describeDb("PAY-204 drop the drift objects (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string) => admin.query(sql);
  const has = async () => ({
    fn: (await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'rls_auto_enable'`)).rows[0].n,
    partial: (await q(`SELECT count(*)::int n FROM pg_indexes WHERE indexname = 'ApprovalWorkflow_tenantId_code_key'`)).rows[0].n,
    full: (await q(`SELECT count(*)::int n FROM pg_indexes WHERE tablename = 'ApprovalWorkflow' AND indexdef LIKE 'CREATE UNIQUE INDEX%("tenantId", code)' AND indexname <> 'ApprovalWorkflow_tenantId_code_key'`)).rows[0].n,
  });
  beforeAll(async () => { admin = new pg.Client({ connectionString: DB }); await admin.connect(); });
  afterAll(async () => { await admin?.end(); });

  it("D1 drops both, keeps the full unique index", async () => {
    await q(`CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql AS 'select 1'`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalWorkflow_tenantId_code_key" ON "ApprovalWorkflow"("tenantId", code) WHERE "deletedAt" IS NULL`);
    expect(await has()).toEqual({ fn: 1, partial: 1, full: 1 });
    await q(SQL());
    expect(await has()).toEqual({ fn: 0, partial: 0, full: 1 });
  });

  it("D2 changes nothing the second time", async () => {
    await q(SQL());
    expect(await has()).toEqual({ fn: 0, partial: 0, full: 1 });
  });
});
