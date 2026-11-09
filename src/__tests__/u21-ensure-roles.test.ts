/**
 * Unit 0.21 — a fresh database cannot migrate: no migration creates `payroll_app`.
 *
 * scripts/db/ensure-roles.mjs runs before `prisma migrate deploy` in
 * scripts/start.sh and in CI. The END-TO-END proof is CI itself: its container
 * starts with no application roles, runs only that script, then migrates all
 * 87 migrations. These tests pin the script's contract against a REAL Postgres:
 *
 *   T1  payroll_app is always ensured; unsafe role names are refused.
 *   T2  a missing role is created NOLOGIN with every elevated attribute off.
 *   T3  an existing role is left exactly as it is (no ALTER, no attribute change).
 *   T4  a connecting role that cannot create the missing role FAILS, and the
 *       error carries the exact statement a superuser must run (fail closed).
 *   T5  start.sh runs the script after its env preflight, before migrate, and
 *       before the server.
 *
 * Needs TEST_DATABASE_URL as a role that can CREATE ROLE (CI: postgres).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import pg from "pg";

import { ensureRoles, rolesToEnsure } from "../../scripts/db/ensure-roles.mjs";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const suffix = randomBytes(4).toString("hex");
const MISSING = `u21_missing_${suffix}`;
const EXISTING = `u21_existing_${suffix}`;
const NOCREATE = `u21_nocreate_${suffix}`;
const NOCREATE_PW = randomBytes(12).toString("hex");
const NEVER_CREATED = `u21_never_${suffix}`;

const quiet = () => {};

describe("unit 0.21 — role list (T1)", () => {
  it("always ensures payroll_app, and de-duplicates", () => {
    expect(rolesToEnsure([])).toEqual(["payroll_app"]);
    expect(rolesToEnsure(["owner", "payroll_app", "owner"])).toEqual(["payroll_app", "owner"]);
  });

  it.each(['x"; DROP ROLE postgres; --', "Payroll_App", "1abc", "", "a-b"])(
    "refuses unsafe role name %j",
    (name) => {
      expect(() => rolesToEnsure([name])).toThrow(/Refusing role name/);
    },
  );
});

describeDb("unit 0.21 — ensure-roles against a real Postgres (T2–T4)", () => {
  let admin: pg.Client;

  const attrs = async (name: string) =>
    (
      await admin.query(
        `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit
           FROM pg_roles WHERE rolname = $1`,
        [name],
      )
    ).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`CREATE ROLE "${EXISTING}" LOGIN CREATEDB`);
    await admin.query(`CREATE ROLE "${NOCREATE}" LOGIN PASSWORD '${NOCREATE_PW}' NOCREATEROLE`);
  });

  afterAll(async () => {
    for (const r of [MISSING, EXISTING, NOCREATE, NEVER_CREATED]) {
      await admin.query(`DROP ROLE IF EXISTS "${r}"`);
    }
    await admin.end();
  });

  it("T2 creates a missing role NOLOGIN with every elevated attribute off", async () => {
    expect(await attrs(MISSING)).toBeUndefined();
    const res = await ensureRoles(admin, [MISSING], quiet);
    expect(res).toEqual({ existing: [], created: [MISSING] });
    expect(await attrs(MISSING)).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolinherit: true,
    });
    // Second run is a no-op.
    expect(await ensureRoles(admin, [MISSING], quiet)).toEqual({ existing: [MISSING], created: [] });
  });

  it("T3 leaves an existing role exactly as it is", async () => {
    const before = await attrs(EXISTING);
    expect(before.rolcanlogin).toBe(true);
    expect(before.rolcreatedb).toBe(true);
    expect(await ensureRoles(admin, [EXISTING], quiet)).toEqual({ existing: [EXISTING], created: [] });
    expect(await attrs(EXISTING)).toEqual(before);
  });

  it("T4 fails closed, naming the statement, when the connecting role cannot create", async () => {
    const u = new URL(DB!);
    u.username = NOCREATE;
    u.password = NOCREATE_PW;
    const weak = new pg.Client({ connectionString: u.toString() });
    await weak.connect();
    try {
      await expect(ensureRoles(weak, [NEVER_CREATED], quiet)).rejects.toThrow(
        new RegExp(`role "${NEVER_CREATED}" is missing and ${NOCREATE} cannot create it .*CREATE ROLE "${NEVER_CREATED}" NOLOGIN`),
      );
    } finally {
      await weak.end();
    }
    expect(await attrs(NEVER_CREATED)).toBeUndefined();
  });
});

describe("unit 0.21 — start.sh ordering (T5)", () => {
  const sh = readFileSync("scripts/start.sh", "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  it("runs ensure-roles after the env preflight, before migrate deploy and the server", () => {
    const preflight = sh.indexOf('if [ -z "${DIRECT_DATABASE_URL:-}" ]');
    const ensure = sh.indexOf("node scripts/db/ensure-roles.mjs");
    const migrate = sh.indexOf('"$BIN/prisma" migrate deploy');
    const serve = sh.indexOf('exec "$BIN/next" start');
    expect(preflight).toBeGreaterThan(-1);
    expect(ensure).toBeGreaterThan(preflight);
    expect(migrate).toBeGreaterThan(ensure);
    expect(serve).toBeGreaterThan(migrate);
  });

  it("runs under set -e, so a failed ensure-roles stops the boot", () => {
    expect(sh).toMatch(/^set -euo pipefail$/m);
  });
});
