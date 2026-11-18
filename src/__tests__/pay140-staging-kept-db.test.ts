/**
 * PAY-140: staging keeps its test data across deploys when its database lives
 * on a Dokploy volume (STAGING_PG_DATA_DIR), and resets only on request.
 *
 *   K1  reset_staging: without a kept database it explains that every restart
 *       already starts fresh; with one it writes the RESET marker the next
 *       start acts on; a missing directory is an error, not a silent no-op.
 *   K2  the seed on a kept database adds what is missing but leaves the seeded
 *       employees' attendance alone (restoreAttendance false); asked
 *       explicitly (seed_scenario), it restores it; a new employee always
 *       gets its attendance.
 *   K3  (real Postgres) the company bootstrap on a kept database keeps the
 *       company, refreshes the admin password from STAGING_ADMIN_PASSWORD and
 *       grants permissions a newer migration added; it never duplicates.
 *   K4  (static) the database is only wiped when it is not kept, or on the
 *       RESET marker, or on a PostgreSQL major-version change; the superuser
 *       has no password and is reached only over the private socket.
 *
 * The shell part (scripts/staging/embedded-db.sh) was run for real on
 * PostgreSQL 18.6, 16 Nov 2026: fresh start, kept across a restart with new
 * role passwords (old one refused, superuser over TCP refused), RESET wipes,
 * and unset STAGING_PG_DATA_DIR behaves as before. Recorded on PAY-140.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import { markStagingReset, TOOLS } from "../../scripts/staging/qa-mcp.mjs";
import { EMPLOYEES, LEAVE_TYPES, RUNS, SHIFTS, seedScenario } from "../../scripts/staging/seed-data.mjs";
import { QA_COMPANY } from "../../scripts/staging/qa-company.mjs";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

describe("PAY-140 K1 reset_staging", () => {
  it("is a connector tool", () => {
    expect(TOOLS.map((t: { name: string }) => t.name)).toContain("reset_staging");
  });
  it("without a kept database: nothing to mark, explains a restart resets", () => {
    const out = markStagingReset({} as unknown as NodeJS.ProcessEnv);
    expect(out.marked).toBe(false);
    expect(out.message).toMatch(/every restart already starts fresh/);
  });
  it("with a kept database: writes the RESET marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "pay140-"));
    try {
      const out = markStagingReset({ STAGING_PG_DATA_DIR: dir } as unknown as NodeJS.ProcessEnv);
      expect(out.marked).toBe(true);
      expect(existsSync(join(dir, "RESET"))).toBe(true);
      expect(out.message).toMatch(/restart_app/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("a missing directory is an error", () => {
    expect(() => markStagingReset({ STAGING_PG_DATA_DIR: join(tmpdir(), "pay140-does-not-exist") } as unknown as NodeJS.ProcessEnv)).toThrow(/does not exist/);
  });
});

describe("PAY-140 K2 the seed on a kept database", () => {
  // A fake API that already has everything the seed creates, except one
  // employee (so we can see a new employee still gets its attendance).
  function fakeApi(missingTag?: string) {
    const posts: { path: string; body: { employeeId?: string } }[] = [];
    const employees = EMPLOYEES.filter((e) => e.tag !== missingTag).map((e, i) => ({ id: `emp-${e.tag}`, lastName: e.lastName, n: i }));
    const runs = RUNS.map((r, i) => ({ id: `run-${i}`, ...r, status: "DRAFT", sheets: [] }));
    const must = async (method: string, path: string, body?: { lastName?: string; employeeId?: string }) => {
      if (method === "POST") {
        posts.push({ path, body: body ?? {} });
        if (path === "/api/employees") return { id: `new-${body?.lastName}` };
        return {};
      }
      if (path === "/api/branches") return [{ id: "b1", name: "QA Head Office" }];
      if (path === "/api/departments") return [{ id: "d1", name: "QA Test Data" }];
      if (path === "/api/shifts") return SHIFTS.map((s, i) => ({ id: `s${i}`, code: s.body.code }));
      if (path.startsWith("/api/leave-types")) return { items: LEAVE_TYPES.map((l, i) => ({ id: `lt${i}`, code: l.code })) };
      if (path.startsWith("/api/employees")) return employees;
      if (path.startsWith("/api/payroll/runs?")) return runs;
      const m = path.match(/^\/api\/payroll\/runs\/(.+)$/);
      if (m) return runs.find((r) => r.id === m[1]);
      throw new Error(`unexpected ${method} ${path}`);
    };
    return { api: { must, request: must }, posts };
  }
  const attendancePosts = (posts: { path: string }[]) => posts.filter((p) => p.path === "/api/period-inputs");
  const totalAttendance = EMPLOYEES.reduce((n, e) => n + e.attendance.length, 0);

  it("kept database at start-up: no attendance overwritten, nothing duplicated", async () => {
    const { api, posts } = fakeApi();
    await seedScenario(api, () => {}, { restoreAttendance: false });
    expect(posts).toEqual([]);
  });
  it("seed_scenario (explicit): restores the standard attendance", async () => {
    const { api, posts } = fakeApi();
    await seedScenario(api, () => {});
    expect(attendancePosts(posts)).toHaveLength(totalAttendance);
  });
  it("K2b (PAY-180, T1) a database with no leave types gets SIL, VL, SL and LWOP; a kept one gets none again", async () => {
    const posted: { path: string; body: { code?: string } }[] = [];
    const empty = {
      must: async (method: string, path: string, body?: { code?: string }) => {
        if (method === "GET" && path.startsWith("/api/leave-types")) return { items: [] };
        if (method === "POST" && path === "/api/leave-types") posted.push({ path, body: body ?? {} });
        return fakeApi().api.must(method, path, body as { lastName?: string });
      },
    };
    await seedScenario({ ...empty, request: empty.must }, () => {}, { restoreAttendance: false });
    expect(posted.map((p) => p.body.code)).toEqual(["SIL", "VL", "SL", "LWOP"]);
    expect(LEAVE_TYPES.find((l) => l.code === "SIL")).toMatchObject({ isPaid: true, accrualFrequency: "ANNUALLY", accrualAmount: 5 });
  });
  it("a missing employee is created with its attendance even when keeping", async () => {
    const { api, posts } = fakeApi("QA-05");
    await seedScenario(api, () => {}, { restoreAttendance: false });
    const qa05 = EMPLOYEES.find((e) => e.tag === "QA-05")!;
    expect(posts.filter((p) => p.path === "/api/employees")).toHaveLength(1);
    expect(attendancePosts(posts)).toHaveLength(qa05.attendance.length);
  });
});

describeDb("PAY-140 K3 the company bootstrap on a kept database (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  // The bootstrap refuses anything but 127.0.0.1, by design.
  const url = (DB ?? "").replace("@localhost:", "@127.0.0.1:");
  const boot = (password: string) =>
    execFileSync("node", ["scripts/staging/bootstrap-company.mjs"], {
      env: { ...process.env, DIRECT_DATABASE_URL: url, STAGING_ADMIN_PASSWORD: password },
      encoding: "utf8",
    });
  const cleanup = async () => {
    await q(`UPDATE "Tenant" SET "ownerUserId" = NULL WHERE id = $1`, [QA_COMPANY.tenantId]);
    await q(`DELETE FROM "User" WHERE id = $1`, [QA_COMPANY.userId]);
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = $1`, [QA_COMPANY.roleId]);
    await q(`DELETE FROM "Role" WHERE id = $1`, [QA_COMPANY.roleId]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [QA_COMPANY.tenantId]);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await admin.end();
  });

  it("first start creates; a later start keeps, refreshes the password, adds new permissions", async () => {
    expect(boot("first-password-0123456789")).toMatch(/created/);
    const perms = Number((await q(`SELECT count(*) n FROM "RolePermission" WHERE "roleId" = $1`, [QA_COMPANY.roleId])).rows[0].n);
    expect(perms).toBeGreaterThan(0);
    // A permission the role does not have yet, as if a newer migration added it.
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = $1 AND "permissionId" = (SELECT "permissionId" FROM "RolePermission" WHERE "roleId" = $1 LIMIT 1)`, [QA_COMPANY.roleId]);

    expect(boot("second-password-0123456789")).toMatch(/kept; admin password refreshed; 1 new permission\(s\) granted/);
    expect(Number((await q(`SELECT count(*) n FROM "RolePermission" WHERE "roleId" = $1`, [QA_COMPANY.roleId])).rows[0].n)).toBe(perms);
    expect(Number((await q(`SELECT count(*) n FROM "Tenant" WHERE "companyCode" = $1`, [QA_COMPANY.companyCode])).rows[0].n)).toBe(1);
    const hash = (await q(`SELECT "passwordHash" h FROM "User" WHERE id = $1`, [QA_COMPANY.userId])).rows[0].h as string;
    expect(await bcrypt.compare("second-password-0123456789", hash)).toBe(true);
    expect(await bcrypt.compare("first-password-0123456789", hash)).toBe(false);
  });
});

describe("PAY-140 K4 (static) when the staging database is wiped", () => {
  const sh = readFileSync("scripts/staging/embedded-db.sh", "utf8");
  it("rm -rf only for an unkept database, the RESET marker, or a major-version change", () => {
    const wipes = sh.split("\n").filter((l) => /\brm -rf\b/.test(l)).map((l) => l.trim());
    expect(wipes).toEqual(['rm -rf "$root"', 'rm -rf "$data" "$root/RESET"', 'rm -rf "$data"']);
    expect(sh).toMatch(/if \[ -z "\$persist" \]; then\n\s+rm -rf "\$root"/);
    expect(sh).toMatch(/elif \[ -f "\$root\/RESET" \]; then/);
  });
  it("the superuser has no password and is reached over the private socket only", () => {
    expect(sh).toMatch(/--auth-local=peer --auth-host=scram-sha-256/);
    expect(sh).not.toMatch(/--pwfile/);
    expect(sh).toMatch(/-h "\$sock"/);
  });
});
