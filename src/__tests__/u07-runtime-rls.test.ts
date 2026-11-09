/**
 * Unit 0.7: runtime RLS integrity (#214). T1–T5 plus the boot assertion.
 *
 * The runtime client (src/lib/prisma.ts, used only by withTenant) must connect
 * as a role RLS actually constrains, so a forgotten withTenant cannot leak
 * another tenant's rows. These tests drive the REAL src/lib/prisma.ts and
 * src/lib/with-tenant.ts against a REAL Postgres, with DATABASE_URL pointing at
 * a login role that is a member of payroll_app and DIRECT_DATABASE_URL at the
 * superuser, exactly the pair production has. Before the fix prisma.ts
 * resolved DIRECT_DATABASE_URL ?? DATABASE_URL, so the superuser won and T1
 * returned every tenant's rows.
 *
 * REP-1 two signals: every probe reports `effect` (rows returned or changed)
 *   and `authDenied` (the database refused with a permission error). A zero-row
 *   result because RLS filtered and a zero-row result because a grant is
 *   missing are NOT the same green.
 * REP-2 hand-written oracle: the expected row ids are the constants below,
 *   never read back from pg_policies or from withTenant.
 * REP-3 loaded fixtures: three real Department rows across two tenants, and a
 *   vacuity guard proves they exist before any "zero rows" is believed.
 *
 *   T1  bare query, no withTenant: ZERO rows.
 *   T2  withTenant(A): exactly A's rows, non-empty, nothing from B.
 *   T3  inside withTenant(A), updating B's row by primary key affects ZERO rows.
 *   T4  context does not persist: on the SAME pooled backend, after
 *       withTenant(A), a bare query sees no tenant and zero rows.
 *   T5  payroll_app (and the probe login) are neither superuser nor BYPASSRLS.
 *   B   scripts/db/assert-runtime-role.mjs passes for the app role and
 *       FAILS CLOSED for a superuser, a table owner, a role lacking grants and
 *       a role with a default tenant baked in.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

const run = promisify(execFile);

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const sfx = randomBytes(4).toString("hex");
// Hand-written oracle (REP-2). cuid-shaped: lowercase alphanumerics only.
const TENANT_A = `u07tenanta${sfx}`;
const TENANT_B = `u07tenantb${sfx}`;
const A1 = `u07depa1${sfx}`;
const A2 = `u07depa2${sfx}`;
const B1 = `u07depb1${sfx}`;
const ALL = [A1, A2, B1];

const PROBE = `u07_runtime_${sfx}`;
const PROBE_PW = randomBytes(12).toString("hex");
const NOGRANT = `u07_nogrant_${sfx}`;
const OWNER = `u07_owner_${sfx}`;
const DEFAULTED = `u07_defaulted_${sfx}`;
const PW = randomBytes(12).toString("hex");

function urlAs(user: string, password: string): string {
  const u = new URL(DB!);
  u.username = user;
  u.password = password;
  return u.toString();
}

type Probe = { effect: number; authDenied: boolean; error?: string };

/** REP-1: run an operation and report both signals. */
async function probe(fn: () => Promise<number>): Promise<Probe> {
  try {
    return { effect: await fn(), authDenied: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const denied = /permission denied|violates row-level security|42501/i.test(msg);
    return { effect: 0, authDenied: denied, error: msg };
  }
}

type PrismaMod = typeof import("@/lib/prisma");
type WithTenantMod = typeof import("@/lib/with-tenant");

describeDb("unit 0.7: runtime RLS (T1–T5)", () => {
  let admin: pg.Client;
  let prisma: PrismaMod["default"];
  let withTenant: WithTenantMod["withTenant"];
  const savedEnv = { DATABASE_URL: process.env.DATABASE_URL, DIRECT: process.env.DIRECT_DATABASE_URL };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(
      `CREATE ROLE "${PROBE}" LOGIN PASSWORD '${PROBE_PW}' NOSUPERUSER NOBYPASSRLS INHERIT IN ROLE payroll_app`,
    );
    for (const [id, code] of [
      [TENANT_A, `UA${sfx}`],
      [TENANT_B, `UB${sfx}`],
    ]) {
      await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [
        id,
        code.toUpperCase(),
      ]);
    }
    for (const [id, t] of [
      [A1, TENANT_A],
      [A2, TENANT_A],
      [B1, TENANT_B],
    ]) {
      await admin.query(
        `INSERT INTO "Department" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $1, now())`,
        [id, t],
      );
    }

    // Production's pair: runtime URL = the RLS-constrained role, admin URL = owner.
    process.env.DATABASE_URL = urlAs(PROBE, PROBE_PW);
    process.env.DIRECT_DATABASE_URL = DB;
    delete (globalThis as { prismaGlobal?: unknown }).prismaGlobal;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).default;
    withTenant = (await import("@/lib/with-tenant")).withTenant;
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => {});
    delete (globalThis as { prismaGlobal?: unknown }).prismaGlobal;
    process.env.DATABASE_URL = savedEnv.DATABASE_URL;
    process.env.DIRECT_DATABASE_URL = savedEnv.DIRECT;
    await admin.query(`DELETE FROM "Department" WHERE id = ANY($1)`, [ALL]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[TENANT_A, TENANT_B]]);
    await admin.query(`DROP ROLE IF EXISTS "${PROBE}"`);
    await admin.end();
  });

  it("vacuity guard (REP-3): the three fixture rows exist", async () => {
    const { rows } = await admin.query(`SELECT id, "tenantId" FROM "Department" WHERE id = ANY($1) ORDER BY id`, [ALL]);
    expect(rows).toEqual(
      [
        { id: A1, tenantId: TENANT_A },
        { id: A2, tenantId: TENANT_A },
        { id: B1, tenantId: TENANT_B },
      ].sort((x, y) => x.id.localeCompare(y.id)),
    );
  });

  it("T1 a bare query with NO withTenant returns ZERO rows", async () => {
    let seen: string[] = [];
    const p = await probe(async () => {
      const rows = await prisma.department.findMany({ where: { id: { in: ALL } }, select: { id: true } });
      seen = rows.map((r) => r.id);
      return rows.length;
    });
    // Should-be-denied case: fails only if the read took effect.
    expect({ effect: p.effect, seen }).toEqual({ effect: 0, seen: [] });
    // And RLS, not a missing grant, is what produced the zero.
    expect({ authDenied: p.authDenied, error: p.error }).toEqual({ authDenied: false, error: undefined });
  });

  it("T2 withTenant(A) returns exactly A's rows, non-empty", async () => {
    let seen: string[] = [];
    const p = await probe(async () => {
      const rows = await withTenant(TENANT_A, (tx) =>
        tx.department.findMany({ where: { id: { in: ALL } }, select: { id: true, tenantId: true } }),
      );
      seen = rows.map((r) => r.id).sort();
      expect(rows.every((r) => r.tenantId === TENANT_A)).toBe(true);
      return rows.length;
    });
    // Should-be-allowed case: fails if authorization stopped it.
    expect(p.authDenied).toBe(false);
    expect(seen).toEqual([A1, A2].sort());
  });

  it("T3 inside withTenant(A), updating B's row by primary key affects ZERO rows", async () => {
    const p = await probe(async () => {
      const res = await withTenant(TENANT_A, (tx) =>
        tx.department.updateMany({ where: { id: B1 }, data: { name: "u07-hijacked" } }),
      );
      return res.count;
    });
    expect(p.effect).toBe(0);
    const { rows } = await admin.query(`SELECT name FROM "Department" WHERE id = $1`, [B1]);
    expect(rows[0].name).toBe(B1);
  });

  it("T4 tenant context does not persist onto the same pooled connection", async () => {
    const inside = await withTenant(TENANT_A, (tx) =>
      tx.$queryRaw<{ pid: number; t: string | null }[]>`
        SELECT pg_backend_pid() AS pid, current_setting('app.current_tenant_id', true) AS t`,
    );
    expect(inside[0].t).toBe(TENANT_A);

    // pg's pool hands back the most recently released connection; keep asking
    // until we are on the backend that just ran withTenant(A).
    let same: { pid: number; t: string | null; n: bigint } | undefined;
    for (let i = 0; i < 20 && !same; i++) {
      const rows = await prisma.$queryRaw<{ pid: number; t: string | null; n: bigint }[]>`
        SELECT pg_backend_pid() AS pid,
               current_setting('app.current_tenant_id', true) AS t,
               (SELECT count(*) FROM "Department" WHERE id = ANY(${ALL})) AS n`;
      if (rows[0].pid === inside[0].pid) same = rows[0];
    }
    expect(same, "never landed on the same backend; T4 is inconclusive").toBeDefined();
    expect(same!.t === null || same!.t === "").toBe(true);
    expect(Number(same!.n)).toBe(0);
  });

  it("T5 payroll_app and the probe login are neither superuser nor BYPASSRLS", async () => {
    const { rows } = await admin.query(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [["payroll_app", PROBE]],
    );
    expect(rows).toEqual(
      [
        { rolname: "payroll_app", rolsuper: false, rolbypassrls: false },
        { rolname: PROBE, rolsuper: false, rolbypassrls: false },
      ].sort((x, y) => x.rolname.localeCompare(y.rolname)),
    );
    const member = await admin.query(`SELECT pg_has_role($1, 'payroll_app', 'USAGE') AS ok`, [PROBE]);
    expect(member.rows[0].ok).toBe(true);
  });
});

describeDb("unit 0.7 B4: boot assertion fails closed", () => {
  let admin: pg.Client;
  const ownedTable = `u07_owned_${sfx}`;

  const assertAs = async (url: string) => {
    try {
      const { stdout } = await run("node", ["scripts/db/assert-runtime-role.mjs"], {
        env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: DB },
      });
      return { code: 0, out: stdout };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return { code: err.code ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`CREATE ROLE "${PROBE}_b" LOGIN PASSWORD '${PW}' NOSUPERUSER NOBYPASSRLS INHERIT IN ROLE payroll_app`);
    await admin.query(`CREATE ROLE "${NOGRANT}" LOGIN PASSWORD '${PW}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`CREATE ROLE "${OWNER}" LOGIN PASSWORD '${PW}' NOSUPERUSER NOBYPASSRLS INHERIT IN ROLE payroll_app`);
    await admin.query(`CREATE TABLE public."${ownedTable}" (id int)`);
    await admin.query(`ALTER TABLE public."${ownedTable}" OWNER TO "${OWNER}"`);
    await admin.query(`CREATE ROLE "${DEFAULTED}" LOGIN PASSWORD '${PW}' NOSUPERUSER NOBYPASSRLS INHERIT IN ROLE payroll_app`);
    await admin.query(`ALTER ROLE "${DEFAULTED}" SET app.current_tenant_id = 'sometenant'`);
  });

  afterAll(async () => {
    await admin.query(`DROP TABLE IF EXISTS public."${ownedTable}"`);
    for (const r of [`${PROBE}_b`, NOGRANT, OWNER, DEFAULTED]) {
      await admin.query(`DROP ROLE IF EXISTS "${r}"`);
    }
    await admin.end();
  });

  it("passes for an RLS-constrained member of payroll_app", async () => {
    const r = await assertAs(urlAs(`${PROBE}_b`, PW));
    expect(r.out).toMatch(/runtime role OK/);
    expect(r.code).toBe(0);
  });

  it("refuses a superuser", async () => {
    const r = await assertAs(DB!);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/superuser/);
  });

  it("refuses DATABASE_URL equal to DIRECT_DATABASE_URL", async () => {
    const r = await assertAs(DB!);
    expect(r.out).toMatch(/same as DIRECT_DATABASE_URL/);
  });

  it("refuses a role that owns a public table (owners can disable RLS)", async () => {
    const r = await assertAs(urlAs(OWNER, PW));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(new RegExp(`owns .*${ownedTable}`));
  });

  it("refuses a role missing grants, naming the tables", async () => {
    const r = await assertAs(urlAs(NOGRANT, PW));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/lacks SELECT\/INSERT\/UPDATE\/DELETE on \d+ table/);
  });

  it("refuses a role with a default tenant baked in (ALTER ROLE ... SET)", async () => {
    const r = await assertAs(urlAs(DEFAULTED, PW));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/app\.current_tenant_id is already 'sometenant'/);
  });

  it("refuses when DATABASE_URL is unset", async () => {
    try {
      await run("node", ["scripts/db/assert-runtime-role.mjs"], {
        env: { ...process.env, DATABASE_URL: "" },
      });
      expect.unreachable("should have exited non-zero");
    } catch (e) {
      const err = e as { code?: number; stderr?: string };
      expect(err.code).toBe(1);
      expect(err.stderr).toMatch(/DATABASE_URL is not set/);
    }
  });
});

describe("unit 0.7 B1–B3: no fallback between the two connection strings", () => {
  const saved = { ...process.env };
  const g = globalThis as { prismaGlobal?: unknown; prismaAdminGlobal?: unknown };

  const fresh = async () => {
    delete g.prismaGlobal;
    delete g.prismaAdminGlobal;
    vi.resetModules();
  };

  afterAll(() => {
    process.env = { ...saved };
    delete g.prismaGlobal;
    delete g.prismaAdminGlobal;
  });

  it("B1 prisma.ts: DATABASE_URL unset throws on first use even with DIRECT_DATABASE_URL set", async () => {
    await fresh();
    delete process.env.DATABASE_URL;
    process.env.DIRECT_DATABASE_URL = "postgresql://owner:pw@127.0.0.1:1/x";
    // Importing must not throw: `next build` imports route modules without credentials.
    const mod = await import("@/lib/prisma");
    expect(() => mod.default.$connect).toThrow(/DATABASE_URL is not set.*never falls back to DIRECT_DATABASE_URL/);
  });

  it("B2 prisma-admin.ts: DIRECT_DATABASE_URL unset throws on first use even with DATABASE_URL set", async () => {
    await fresh();
    process.env.DATABASE_URL = "postgresql://app:pw@127.0.0.1:1/x";
    delete process.env.DIRECT_DATABASE_URL;
    const mod = await import("@/lib/prisma-admin");
    expect(() => mod.default.$connect).toThrow(/DIRECT_DATABASE_URL is not set.*never fall back to DATABASE_URL/);
  });

  it("B3 jobs/client.ts: the queue uses DIRECT_DATABASE_URL only", async () => {
    await fresh();
    process.env.DATABASE_URL = "postgresql://app:pw@127.0.0.1:1/x";
    delete process.env.DIRECT_DATABASE_URL;
    const { getJobQueue } = await import("@/lib/jobs/client");
    expect(() => getJobQueue()).toThrow(/DIRECT_DATABASE_URL is not set/);
  });

  it("each client reads its own variable when both are set", async () => {
    const { runtimeDatabaseUrl, adminDatabaseUrl } = await import("@/lib/db-urls");
    process.env.DATABASE_URL = "postgresql://app@h/x";
    process.env.DIRECT_DATABASE_URL = "postgresql://owner@h/x";
    expect(runtimeDatabaseUrl()).toBe("postgresql://app@h/x");
    expect(adminDatabaseUrl()).toBe("postgresql://owner@h/x");
  });
});
