/**
 * Unit 0.24: integration harness. The WHOLE app against a real Postgres.
 *
 * REP-25: boot the application through the same config chain a web request
 * uses, against a real database, with fixtures the harness seeds and deletes
 * itself. Exit 0 = clean, 1 = at least one finding, 2 = the harness itself
 * could not run (that is never reported as clean).
 * REP-26: it is a script, not a Vitest suite, because it has to boot a server.
 *
 * Production shape, on purpose. The two things unit tests cannot see are
 * which ROLE the app runs as and what the RLS catalogue does to real routes:
 *   - migrations run as `it_owner`: LOGIN, NOT superuser, NOT BYPASSRLS, owner
 *     of the database (production's `owner`). CI and the unit tests migrate
 *     as the `postgres` superuser, which bypasses RLS and hid unit 0.7's
 *     catalogue gaps.
 *   - DIRECT_DATABASE_URL = it_owner (prismaAdmin, pg-boss).
 *   - DATABASE_URL = it_runtime, a login that inherits payroll_app only
 *     (the role unit 0.7 moves the runtime client onto).
 *
 * Each scenario reports two signals (REP-1): `effect` (what came back) and
 * `authDenied` (whether the app refused). Expectations are hand-written ids
 * (REP-2) for rows the harness seeded itself (REP-3).
 *
 * Usage (needs a Postgres where INTEGRATION_ADMIN_URL can CREATE ROLE and
 * CREATE DATABASE; a throwaway cluster or the CI service container):
 *   INTEGRATION_ADMIN_URL=postgresql://postgres:pw@localhost:5432/postgres \
 *     npx tsx scripts/integration/harness.ts [--fresh] [--keep] [--port 3100]
 *
 *   --fresh  drop and recreate the integration database and roles first
 *   --keep   leave the seeded rows and the server's database in place
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import bcrypt from "bcryptjs";
import pg from "pg";

// ── configuration ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FRESH = args.includes("--fresh");
const KEEP = args.includes("--keep");
const PORT = Number(args[args.indexOf("--port") + 1]) || 3100;
const BASE = `http://localhost:${PORT}`;
const ADMIN_URL = process.env.INTEGRATION_ADMIN_URL;
const DB_NAME = process.env.INTEGRATION_DB_NAME ?? "sentire_it";
const BOOT_TIMEOUT_MS = Number(process.env.INTEGRATION_BOOT_TIMEOUT_MS ?? 300_000);
const REQUEST_TIMEOUT_MS = 180_000; // next dev compiles each route on first hit

const OWNER = "it_owner";
const RUNTIME = "it_runtime";
const OWNER_PW = randomBytes(16).toString("hex");
const RUNTIME_PW = randomBytes(16).toString("hex");

function fail(msg: string): never {
  console.error(`[harness] CANNOT RUN: ${msg}`);
  process.exit(2);
}
if (!ADMIN_URL) fail("INTEGRATION_ADMIN_URL is not set (a role that can CREATE ROLE and CREATE DATABASE).");

function urlFor(user: string, password: string, db = DB_NAME): string {
  const u = new URL(ADMIN_URL!);
  u.username = user;
  u.password = password;
  u.pathname = `/${db}`;
  return u.toString();
}

const log = (m: string) => console.log(`[harness] ${m}`);

// ── fixtures (REP-2: hand-written; REP-3: real rows) ────────────────────────
const RUN = randomBytes(3).toString("hex");
const id = (s: string) => `it${s}${RUN}`; // cuid-shaped: lowercase alphanumerics
const PASSWORD = `It-${randomBytes(9).toString("hex")}`;

const TENANTS = {
  A: { id: id("tena"), code: `ITA${RUN}`.toUpperCase(), email: `admin-a-${RUN}@it.test` },
  B: { id: id("tenb"), code: `ITB${RUN}`.toUpperCase(), email: `admin-b-${RUN}@it.test` },
} as const;
const DEPTS = { A: [id("depa1"), id("depa2")], B: [id("depb1")] } as const;
// JobLevel had NO row level security before unit 0.7's catalogue migration.
const LEVELS = { A: [id("lvla1")], B: [id("lvlb1")] } as const;
const EMPS = {
  A: [
    { id: id("empa1"), no: `A1-${RUN}` },
    { id: id("empa2"), no: `A2-${RUN}` },
  ],
  B: [{ id: id("empb1"), no: `B1-${RUN}` }],
} as const;

// ── database lifecycle ──────────────────────────────────────────────────────
async function withAdmin<T>(db: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const u = new URL(ADMIN_URL!);
  if (db) u.pathname = `/${db}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function prepareDatabase(): Promise<void> {
  await withAdmin(null, async (c) => {
    if (FRESH) {
      log(`--fresh: dropping database ${DB_NAME}`);
      await c.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    }
    for (const [role, pw, extra] of [
      [OWNER, OWNER_PW, ""],
      [RUNTIME, RUNTIME_PW, ""],
    ] as const) {
      const exists = (await c.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role])).rowCount === 1;
      const attrs = `LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB ${extra}`;
      await c.query(exists ? `ALTER ROLE "${role}" ${attrs}` : `CREATE ROLE "${role}" ${attrs}`);
    }
    // Roles the migrations GRANT to. Same script start.sh runs when present (unit 0.21).
    const ensure = (await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app'`)).rowCount === 1;
    if (!ensure) {
      await c.query(`CREATE ROLE payroll_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    }
    await c.query(`GRANT payroll_app TO "${RUNTIME}"`);
    const dbExists = (await c.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME])).rowCount === 1;
    if (!dbExists) {
      await c.query(`CREATE DATABASE "${DB_NAME}" OWNER "${OWNER}"`);
      log(`created database ${DB_NAME} owned by ${OWNER}`);
    }
  });
  // PG15+: public schema belongs to pg_database_owner; make the owner explicit.
  await withAdmin(DB_NAME, (c) => c.query(`ALTER SCHEMA public OWNER TO "${OWNER}"`));
}

function migrate(): void {
  log(`migrating as ${OWNER} (non-superuser, production shape)`);
  const env = { ...process.env, DIRECT_DATABASE_URL: urlFor(OWNER, OWNER_PW), DATABASE_URL: urlFor(OWNER, OWNER_PW) };
  if (existsSync("scripts/db/ensure-roles.mjs")) {
    execFileSync("node", ["scripts/db/ensure-roles.mjs"], { env, stdio: "inherit" });
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: ["ignore", "ignore", "inherit"] });
  log("migrations applied");
}

// ── seeding (as the owner, like prismaAdmin) ────────────────────────────────
async function seed(): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const c = new pg.Client({ connectionString: urlFor(OWNER, OWNER_PW) });
  await c.connect();
  try {
    const perms = (await c.query(`SELECT id FROM "Permission"`)).rows.map((r) => r.id as string);
    if (perms.length === 0) throw new Error("no Permission rows: the permission seed migration did not apply");
    for (const k of ["A", "B"] as const) {
      const t = TENANTS[k];
      await c.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $2, $3, now())`, [
        t.id,
        `Integration ${k} ${RUN}`,
        t.code,
      ]);
      const roleId = id(`role${k.toLowerCase()}`);
      await c.query(
        `INSERT INTO "Role" (id, "tenantId", name, "isSystem", "updatedAt") VALUES ($1, $2, 'Administrator', true, now())`,
        [roleId, t.id],
      );
      for (const p of perms) {
        await c.query(`INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ($1, $2)`, [roleId, p]);
      }
      await c.query(
        `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "roleId", "isActive", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Admin', $5, 'TENANT_USER', $6, true, now())`,
        [id(`user${k.toLowerCase()}`), t.id, t.email, hash, k, roleId],
      );
      for (const d of DEPTS[k]) {
        await c.query(`INSERT INTO "Department" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $1, now())`, [d, t.id]);
      }
      for (const l of LEVELS[k]) {
        await c.query(`INSERT INTO "JobLevel" (id, "tenantId", name) VALUES ($1, $2, $1)`, [l, t.id]);
      }
      for (const e of EMPS[k]) {
        await c.query(
          `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
           VALUES ($1, $2, $3, 'Fixture', $3, '2026-01-05', now())`,
          [e.id, t.id, e.no],
        );
      }
    }
    log(`seeded tenants A and B (run ${RUN})`);
  } finally {
    await c.end();
  }
}

async function cleanup(): Promise<void> {
  if (KEEP) return log("--keep: seeded rows left in place");
  const c = new pg.Client({ connectionString: urlFor(OWNER, OWNER_PW) });
  await c.connect();
  try {
    const tenantIds = [TENANTS.A.id, TENANTS.B.id];
    // Children first. Anything the app itself wrote for these tenants goes too.
    const tables = (
      await c.query<{ t: string }>(
        `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT IN ('Tenant')
            AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped)`,
      )
    ).rows.map((r) => r.t);
    await c.query(`DELETE FROM "RolePermission" WHERE "roleId" = ANY($1)`, [[id("rolea"), id("roleb")]]);
    for (let pass = 0; pass < 4; pass++) {
      for (const t of tables) {
        await c.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1)`, [tenantIds]).catch(() => {});
      }
    }
    await c.query(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [tenantIds]);
    log("seeded rows deleted");
  } finally {
    await c.end();
  }
}

// ── the app ─────────────────────────────────────────────────────────────────
let server: ChildProcess | null = null;
let serverLog = "";

function appEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(PORT),
    DATABASE_URL: urlFor(RUNTIME, RUNTIME_PW),
    DIRECT_DATABASE_URL: urlFor(OWNER, OWNER_PW),
    AUTH_SECRET: randomBytes(32).toString("base64"),
    AUTH_URL: BASE,
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_URL: BASE,
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

async function boot(): Promise<void> {
  const env = appEnv();
  if (existsSync("scripts/db/assert-runtime-role.mjs")) {
    log("boot assertion (unit 0.7): checking the runtime role");
    execFileSync("node", ["scripts/db/assert-runtime-role.mjs"], { env, stdio: "inherit" });
  }
  log(`starting next dev on :${PORT}`);
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const keep = (b: Buffer) => {
    serverLog = (serverLog + b.toString()).slice(-200_000);
  };
  server.stdout?.on("data", keep);
  server.stderr?.on("data", keep);

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited (${server.exitCode})`);
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (r.status === 200) return log(`app is up (${Math.round((BOOT_TIMEOUT_MS - (deadline - Date.now())) / 1000)}s)`);
    } catch {
      // not listening yet
    }
    await sleep(2000);
  }
  throw new Error("app did not answer /api/health in time");
}

function stop(): void {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

// ── HTTP with a cookie jar ──────────────────────────────────────────────────
class Session {
  private jar = new Map<string, string>();
  private take(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  private cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(path: string, init: RequestInit = {}): Promise<Response> {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), cookie: this.cookie() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.take(r);
    return r;
  }
  async signIn(email: string, companyCode: string): Promise<boolean> {
    const csrf = await (await this.req("/api/auth/csrf")).json();
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      companyCode,
      scope: "tenant",
      callbackUrl: `${BASE}/`,
    });
    await this.req("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const me = await this.req("/api/auth/session");
    const s = await me.json().catch(() => null);
    return !!s?.user;
  }
}

// ── scenarios ───────────────────────────────────────────────────────────────
type Result = {
  scenario: string;
  expect: string;
  status: number;
  effect: string[];
  authDenied: boolean;
  pass: boolean;
  note?: string;
};
const results: Result[] = [];

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

async function listIds(s: Session, path: string, key: (row: Record<string, unknown>) => string) {
  const r = await s.req(path);
  const body = await r.json().catch(() => null);
  const rows: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
  return { status: r.status, ids: rows.map(key), denied: r.status === 401 || r.status === 403 };
}

/** Should-be-allowed: fails only if authorization stopped it or the rows are wrong. */
async function expectExactly(s: Session, name: string, path: string, key: (r: Record<string, unknown>) => string, want: readonly string[], ownTenantFilter: (id: string) => boolean) {
  const { status, ids, denied } = await listIds(s, path, key);
  const mine = ids.filter(ownTenantFilter);
  const foreign = ids.filter((x) => x.includes(RUN) && !ownTenantFilter(x));
  const pass = !denied && status === 200 && sameSet(mine, want) && foreign.length === 0;
  results.push({
    scenario: name,
    expect: `200, exactly [${want.join(", ")}], no other tenant's fixtures`,
    status,
    effect: ids.filter((x) => x.includes(RUN)),
    authDenied: denied,
    pass,
    ...(foreign.length ? { note: `LEAK: other tenant's rows returned: ${foreign.join(", ")}` } : {}),
    ...(!foreign.length && !pass && !denied ? { note: "DISAPPEARED or wrong: the tenant's own rows were not all returned" } : {}),
  });
}

/** Should-be-denied: fails only if the verb took effect. */
async function expectNotFound(s: Session, name: string, path: string) {
  const r = await s.req(path);
  const body = await r.json().catch(() => null);
  const tookEffect = r.status === 200 && !!body?.data;
  results.push({
    scenario: name,
    expect: "404 (or 403); never the row",
    status: r.status,
    effect: tookEffect ? [String(body.data.id ?? "row")] : [],
    authDenied: r.status === 401 || r.status === 403,
    pass: !tookEffect,
  });
}

async function runScenarios(): Promise<void> {
  const a = new Session();
  const b = new Session();
  const anon = new Session();

  const signedA = await a.signIn(TENANTS.A.email, TENANTS.A.code);
  const signedB = await b.signIn(TENANTS.B.email, TENANTS.B.code);
  results.push({ scenario: "S0 sign-in, tenant A admin", expect: "session", status: signedA ? 200 : 0, effect: [], authDenied: !signedA, pass: signedA });
  results.push({ scenario: "S0 sign-in, tenant B admin", expect: "session", status: signedB ? 200 : 0, effect: [], authDenied: !signedB, pass: signedB });
  if (!signedA || !signedB) return;

  const empNo = (r: Record<string, unknown>) => String(r.employeeNumber ?? r.id);
  const isA = (x: string) => x.startsWith("A");
  const isB = (x: string) => x.startsWith("B");
  await expectExactly(a, "S1 GET /api/employees as A", "/api/employees?limit=100", empNo, EMPS.A.map((e) => e.no), isA);
  await expectExactly(b, "S1 GET /api/employees as B", "/api/employees?limit=100", empNo, EMPS.B.map((e) => e.no), isB);

  const deptId = (r: Record<string, unknown>) => String(r.id);
  await expectExactly(a, "S2 GET /api/departments as A", "/api/departments", deptId, DEPTS.A, (x) => x.startsWith("itdepa"));
  await expectExactly(b, "S2 GET /api/departments as B", "/api/departments", deptId, DEPTS.B, (x) => x.startsWith("itdepb"));

  await expectExactly(a, "S3 GET /api/employees/ess as A", "/api/employees/ess", empNo, EMPS.A.map((e) => e.no), isA);

  await expectNotFound(a, "S4 A reads B's employee by id", `/api/employees/${EMPS.B[0].id}`);
  await expectNotFound(b, "S4 B reads A's employee by id", `/api/employees/${EMPS.A[0].id}`);

  const lvl = (r: Record<string, unknown>) => String(r.id);
  await expectExactly(a, "S6 GET /api/job-levels as A", "/api/job-levels", lvl, LEVELS.A, (x) => x.startsWith("itlvla"));
  await expectExactly(b, "S6 GET /api/job-levels as B", "/api/job-levels", lvl, LEVELS.B, (x) => x.startsWith("itlvlb"));

  // S7 (unit 0.7, #214 at the whole-app level): tenant traffic must have run
  // on the RLS-constrained login. Before 0.7 the runtime client preferred
  // DIRECT_DATABASE_URL, so only the owner ever connected.
  const users = await withAdmin(null, async (c) =>
    (
      await c.query<{ usename: string }>(
        `SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = $1 AND usename = ANY($2) ORDER BY 1`,
        [DB_NAME, [OWNER, RUNTIME]],
      )
    ).rows.map((x) => x.usename),
  );
  results.push({
    scenario: "S7 tenant requests ran as the RLS-constrained role",
    expect: `${RUNTIME} among the app's connections`,
    status: 0,
    effect: users,
    authDenied: false,
    pass: users.includes(RUNTIME),
    ...(users.includes(RUNTIME) ? {} : { note: `only ${users.join(", ") || "nobody"} connected: withTenant traffic is not on payroll_app (#214)` }),
  });

  const r = await anon.req("/api/employees");
  results.push({
    scenario: "S5 GET /api/employees signed out",
    expect: "401",
    status: r.status,
    effect: [],
    authDenied: r.status === 401 || r.status === 403,
    pass: r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400),
  });
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
  const started = Date.now();
  try {
    await prepareDatabase();
    migrate();
    await seed();
    await boot();
  } catch (e) {
    stop();
    console.error(serverLog.slice(-4000));
    fail(e instanceof Error ? e.message : String(e));
  }

  try {
    await runScenarios();
  } catch (e) {
    results.push({ scenario: "harness", expect: "scenarios run", status: 0, effect: [], authDenied: false, pass: false, note: String(e) });
  } finally {
    stop();
    await cleanup().catch((e) => console.error(`[harness] cleanup failed: ${e}`));
  }

  const findings = results.filter((r) => !r.pass);
  console.log("");
  for (const r of results) {
    console.log(
      `${r.pass ? "PASS" : "FINDING"}  ${r.scenario}\n        status=${r.status} authDenied=${r.authDenied} effect=[${r.effect.join(", ")}]` +
        (r.note ? `\n        ${r.note}` : "") +
        (r.pass ? "" : `\n        expected: ${r.expect}`),
    );
  }
  const report = { run: RUN, seconds: Math.round((Date.now() - started) / 1000), scenarios: results.length, findings: findings.length, results };
  writeFileSync("integration-report.json", JSON.stringify(report, null, 2));
  console.log(`\n[harness] ${results.length} scenario(s), ${findings.length} finding(s), ${report.seconds}s. Report: integration-report.json`);
  if (findings.length) console.error(serverLog.split("\n").filter((l) => /error|Error|denied|violates/.test(l)).slice(-40).join("\n"));
  return findings.length ? 1 : 0;
}

main().then((code) => process.exit(code));
