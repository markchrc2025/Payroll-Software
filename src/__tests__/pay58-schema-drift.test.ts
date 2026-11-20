/**
 * PAY-58 (plan 1.3): "Report-only comparison of the live schema with what the
 * migrations produce. Now concrete: 0.7 T6 found production appears to carry
 * admin_bypass policies the migrations never create."
 *
 *   T1  an object in the live database that the migrations never create is
 *       reported as unexpected; one the migrations create that is not there
 *       is reported as missing (fails on main: no check).
 *   T2  a matching schema reports OK with the object count.
 *   T3  the report only prints: report mode always exits 0, and the start
 *       script runs it after the migrations and cannot be stopped by it.
 *   T4  the committed reference is a sorted, de-duplicated list that covers
 *       tables, columns, indexes, constraints, policies and enum types.
 *   D1  (real Postgres) a database built from the migrations matches the
 *       committed reference, so the reference is current.
 *   D2  (real Postgres) a policy added outside the migrations is reported.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { diffFingerprints, driftReport, loadReference, readFingerprint } from "../../scripts/db/schema-fingerprint.mjs";

const REF = [
  'column "Employee"."id" text not null',
  'policy "Employee" tenant_isolation PERMISSIVE ALL to payroll_app using ("tenantId" = current_setting(\'app.current_tenant_id\'::text))',
  'table "Employee" rls=true force=true',
];

describe("PAY-58 schema drift report", () => {
  it("T1 unexpected and missing objects are listed", () => {
    const live = [
      'column "Employee"."id" text not null',
      'policy "Employee" admin_bypass PERMISSIVE ALL to postgres using (true)',
      'table "Employee" rls=true force=false',
    ];
    expect(diffFingerprints(REF, live)).toEqual({
      missing: [REF[1], REF[2]],
      unexpected: [live[1], live[2]],
    });
    const lines: string[] = driftReport(REF, live);
    expect(lines[0]).toBe("[schema-drift] DRIFT: 2 missing, 2 unexpected (reference has 3 objects). Report only; nothing was changed.");
    expect(lines).toContain('[schema-drift] unexpected: policy "Employee" admin_bypass PERMISSIVE ALL to postgres using (true)');
    expect(lines).toContain('[schema-drift] missing: table "Employee" rls=true force=true');
  });

  it("T2 a matching schema reports OK", () => {
    expect(driftReport(REF, [...REF])).toEqual(["[schema-drift] OK: the live schema matches the migrations (3 objects)."]);
  });

  it("T3 report only: never stops the server", () => {
    const script = readFileSync("scripts/db/schema-fingerprint.mjs", "utf8");
    expect(script).toContain('process.exit(mode === "--write" ? 1 : 0)');
    expect(script).not.toMatch(/\b(ALTER|DROP|CREATE|INSERT|UPDATE|DELETE)\s/);
    const start = readFileSync("scripts/start.sh", "utf8");
    const migrate = start.indexOf('"$BIN/prisma" migrate deploy');
    const report = start.indexOf("node scripts/db/schema-fingerprint.mjs --report || true");
    const role = start.indexOf("node scripts/db/assert-runtime-role.mjs");
    expect(migrate).toBeGreaterThan(0);
    expect(report).toBeGreaterThan(migrate);
    expect(role).toBeGreaterThan(report);
  });

  it("T4 the committed reference is sorted and covers every kind of object", () => {
    const ref: string[] = loadReference();
    expect(ref.length).toBeGreaterThan(1000);
    expect([...new Set(ref)].sort()).toEqual(ref);
    for (const kind of ["table ", "column ", "index ", "constraint ", "policy ", "enum "]) {
      expect(ref.some((l) => l.startsWith(kind)), kind).toBe(true);
    }
    expect(ref.some((l) => l.includes("_prisma_migrations"))).toBe(false);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

describeDb("PAY-58 schema drift report (real Postgres)", () => {
  it("D1 a database built from the migrations matches the committed reference", async () => {
    const client = new pg.Client({ connectionString: DB });
    await client.connect();
    try {
      const diff = diffFingerprints(loadReference(), await readFingerprint(client));
      // On a mismatch, regenerate: node scripts/db/schema-fingerprint.mjs --write (against a migrations-only database).
      expect(diff).toEqual({ missing: [], unexpected: [] });
    } finally {
      await client.end();
    }
  });

  it("D2 a policy added outside the migrations is reported", async () => {
    const name = `p58_drift_${randomBytes(3).toString("hex")}`;
    const client = new pg.Client({ connectionString: DB });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE POLICY ${name} ON "Tenant" FOR SELECT USING (true)`);
      const diff = diffFingerprints(loadReference(), await readFingerprint(client));
      expect(diff.missing).toEqual([]);
      expect(diff.unexpected).toHaveLength(1);
      expect(diff.unexpected[0]).toContain(`policy "Tenant" ${name} PERMISSIVE SELECT to public using true`);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
