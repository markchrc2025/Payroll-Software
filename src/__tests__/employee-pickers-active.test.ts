/**
 * PAY-129: the admin's employee pickers were empty ("No employees found") on
 * Movements, Placement, Employment Terms, Leave, Loans, Expense Claims,
 * Incidents and Assets. Every one asks GET /api/employees with status=ACTIVE,
 * mostly limit=500, and the list schema accepted neither, so the route
 * answered 400 and the picker showed nothing. Reported by Mark on 13 Nov 2026
 * (an employee in the list, missing from the New Movement Request picker).
 * P1 also found Approval Roles (a comma list of statuses, now status=ACTIVE)
 * and three limit=500-only callers (Departments, Add and Edit Employee).
 *
 *   P1  (static) every /api/employees query the dashboard sends is one the
 *       list schema accepts.
 *   P2  (real route, real Postgres) status=ACTIVE&limit=500 returns the
 *       currently employed (probationary, regular, contractual, project-based)
 *       and leaves out the separated (resigned, terminated, retired).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn() }));

import { getAuthContext } from "@/lib/auth";
import prismaAdmin from "@/lib/prisma-admin";
import { listEmployeesSchema } from "@/lib/validations/employee";
import { GET as listEmployees } from "@/app/api/employees/route";

describe("PAY-129 P1: the dashboard only sends employee queries the server accepts", () => {
  it("P1 every /api/employees?... query in the dashboard parses", () => {
    const files = execSync("git ls-files 'src/app/(dashboard)/**' 'src/components/**'", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.tsx?$/.test(f));
    const queries: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/["`]\/api\/employees\?([^"`]+)["`]/g)) {
        // template parts (${...}) stand for a value: use a harmless one
        queries.push(`${f}: ${m[1].replace(/\$\{[^}]*\}/g, "x")}`);
      }
    }
    expect(queries.length).toBeGreaterThanOrEqual(9); // vacuity guard: the pickers are really scanned
    const rejected = queries.filter((q) => {
      const qs = q.slice(q.indexOf(": ") + 2);
      return !listEmployeesSchema.safeParse(Object.fromEntries(new URLSearchParams(qs))).success;
    });
    expect(rejected).toEqual([]);
  });
});

describe("PAY-129 P3: other list filters the dashboard sends", () => {
  it("P3 the Pay Components page's query parses, and query-string false means false", async () => {
    const { listPayComponentsSchema } = await import("@/lib/validations/pay-component");
    const { listLeaveTypesSchema } = await import("@/lib/validations/leave");
    const { listJobPostingsSchema, listApplicantsSchema } = await import("@/lib/validations/ats");

    // the page asks limit=200 (the cap was 100, so the page got a 400 and showed nothing)
    const page = readFileSync("src/app/(dashboard)/pay-components/page.tsx", "utf8").match(/\/api\/pay-components\?([^"`]+)/)![1];
    const pc = listPayComponentsSchema.safeParse(Object.fromEntries(new URLSearchParams(page)));
    expect(pc.success).toBe(true);
    // z.coerce.boolean() read the text "false" as true: includeDeleted=false showed deleted rows
    expect(pc.data!.includeDeleted).toBe(false);

    const q = { isActive: "false", includeDeleted: "false" };
    expect(listPayComponentsSchema.parse(q)).toMatchObject({ isActive: false, includeDeleted: false });
    expect(listLeaveTypesSchema.parse(q)).toMatchObject({ isActive: false, includeDeleted: false });
    expect(listJobPostingsSchema.parse({ includeDeleted: "false" }).includeDeleted).toBe(false);
    expect(listApplicantsSchema.parse({ includeDeleted: "false" }).includeDeleted).toBe(false);
    // and "true" still means true; absent still means the default
    expect(listPayComponentsSchema.parse({ includeDeleted: "true" }).includeDeleted).toBe(true);
    expect(listLeaveTypesSchema.parse({}).includeDeleted).toBe(false);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p129t${sfx}`;
const ROLE = `p129r${sfx}`;
const USER = `p129u${sfx}`;
const PEOPLE: [string, string][] = [
  [`p129prob${sfx}`, "PROBATIONARY"],
  [`p129reg${sfx}`, "REGULAR"],
  [`p129con${sfx}`, "CONTRACTUAL"],
  [`p129proj${sfx}`, "PROJECT_BASED"],
  [`p129res${sfx}`, "RESIGNED"],
  [`p129ter${sfx}`, "TERMINATED"],
  [`p129ret${sfx}`, "RETIRED"],
];

let admin: pg.Client;
const get = (qs: string) => {
  const url = `http://test.local/api/employees?${qs}`;
  return Object.assign(new Request(url), { nextUrl: new URL(url) }) as never;
};

describeDb("PAY-129 P2: status=ACTIVE on the real route", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P129${sfx}`.toUpperCase()]);
    await admin.query(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $1, now())`, [ROLE, T]);
    await admin.query(
      `INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'EMPLOYEES' AND action = 'READ'`,
      [ROLE],
    );
    await admin.query(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "roleId", "isActive", "updatedAt")
       VALUES ($1, $2, $3, 'x', 'P129', 'User', 'TENANT_USER', $4, true, now())`,
      [USER, T, `${USER}@p129.test`, ROLE],
    );
    for (const [id, status] of PEOPLE) {
      await admin.query(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "updatedAt")
         VALUES ($1, $2, $1, 'P129', $1, '2026-01-05', $3::"EmploymentStatus", now())`,
        [id, T, status],
      );
    }
    vi.mocked(getAuthContext).mockResolvedValue({ tenantId: T, userId: USER, systemRole: "TENANT_USER", roleId: ROLE } as never);
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  it("P2 the pickers' query returns the currently employed, not the separated", async () => {
    const res = await listEmployees(get("limit=500&status=ACTIVE"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    const ids = body.data.map((e) => e.id).sort();
    expect(ids).toEqual(PEOPLE.slice(0, 4).map(([id]) => id).sort());

    // a single real status still filters exactly (unchanged behaviour)
    const resigned = await listEmployees(get("status=RESIGNED"));
    expect(resigned.status).toBe(200);
    expect(((await resigned.json()) as { data: { id: string }[] }).data.map((e) => e.id)).toEqual([PEOPLE[4][0]]);

    // a value that is neither a status nor ACTIVE is still refused
    expect((await listEmployees(get("status=SOMETHING"))).status).toBe(400);
  });
});
