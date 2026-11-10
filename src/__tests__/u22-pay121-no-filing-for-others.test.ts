/**
 * PAY-121, the unit 0.22 follow-up Mark approved on 10 Nov 2026: "remove that
 * button". Ruling B6: no one files for another employee.
 *
 *   F1  (static) the dashboard has no way left to file or submit for someone
 *       else: no create calls for expense claims, DTR submissions or OT, and no
 *       HR "Submit" on someone's draft claim.
 *   F2  (real route, real Postgres) the one filing route 0.22 Am 1 missed: HR
 *       with TIMESHEETS:CREATE could file OT for any employee. Now refused, and
 *       nothing is written; filing one's own still works.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn() }));

import { getAuthContext } from "@/lib/auth";
import prismaAdmin from "@/lib/prisma-admin";
import { POST as fileOt } from "@/app/api/employees/[id]/ot-applications/route";

describe("PAY-121 F1: no file-for-employee controls left in the dashboard", () => {
  it("F1 the dashboard does not create or submit expense claims, DTR submissions or OT for others", () => {
    const files = execSync("git ls-files 'src/app/(dashboard)/**/*.tsx' 'src/components/**/*.tsx'", { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((f) => !f.startsWith("src/components/ess/"));
    const filing = [
      /fetch\(\s*"\/api\/expense-claims"\s*,\s*\{\s*method:\s*"POST"/,
      /fetch\(\s*`\/api\/expense-claims\/\$\{[^}]+\}\/submit`/,
      /fetch\(\s*"\/api\/dtr\/submissions"\s*,\s*\{\s*method:\s*"POST"/,
      /fetch\(\s*`\/api\/employees\/\$\{[^}]+\}\/ot-applications`\s*,\s*\{\s*method:\s*"POST"/,
      /fetch\(\s*`\/api\/employees\/\$\{[^}]+\}\/leave-transactions`\s*,\s*\{\s*method:\s*"POST"/,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const re of filing) if (re.test(src)) hits.push(`${f}: ${re.source}`);
    }
    expect(hits).toEqual([]);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p121t${sfx}`;
const ROLE = `p121r${sfx}`;
const USER = `p121u${sfx}`;
const ME = `p121me${sfx}`;
const OTHER = `p121ot${sfx}`;
let admin: pg.Client;
const otCount = async (emp: string) =>
  Number((await admin.query(`SELECT count(*) FROM "OTApplication" WHERE "employeeId" = $1`, [emp])).rows[0].count);
const file = (emp: string) =>
  fileOt(
    new Request("http://test.local/api", {
      method: "POST",
      body: JSON.stringify({ date: "2026-11-09", hours: 2, justification: "month-end close" }),
    }) as never,
    { params: Promise.resolve({ id: emp }) } as never,
  );

describeDb("PAY-121 F2: HR cannot file OT for another employee", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P121${sfx}`.toUpperCase()]);
    await admin.query(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $1, now())`, [ROLE, T]);
    await admin.query(
      `INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'TIMESHEETS' AND action = 'CREATE'`,
      [ROLE],
    );
    await admin.query(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "isActive", "roleId", "updatedAt")
       VALUES ($1, $2, $3, 'x', 'HR', 'User', 'TENANT_USER', true, $4, now())`,
      [USER, T, `${USER}@p121.test`, ROLE],
    );
    for (const [id, userId] of [[ME, USER], [OTHER, null]] as const) {
      await admin.query(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt", "userId")
         VALUES ($1, $2, $1, 'P121', $1, '2026-01-05', now(), $3)`,
        [id, T, userId],
      );
    }
    vi.mocked(getAuthContext).mockResolvedValue({ tenantId: T, userId: USER, systemRole: "TENANT_USER", roleId: ROLE } as never);
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "OTApplication" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  it("F2 filing for someone else is refused and writes nothing; filing one's own works", async () => {
    expect((await file(OTHER)).status).toBe(403);
    expect(await otCount(OTHER)).toBe(0);
    expect((await file(ME)).status).toBe(201);
    expect(await otCount(ME)).toBe(1);
  });
});
