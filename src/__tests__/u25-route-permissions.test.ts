/**
 * Unit 0.25 (approved by Mark on 10 Nov 2026): every signed-in tenant API
 * handler checks the caller's ROLE, so role customization controls access.
 *
 * Mark's data-privacy rule: authorized access is not a breach; access without
 * authority is. Before this unit, 108 handlers in 70 route files checked only
 * sign-in.
 *
 * S1  (static, the CI gate) every tenant handler that signs the caller in has
 *     a permission check, an own-records check, or an `@permission-exempt:`
 *     comment with a reason. A new route without one fails this test.
 * Real routes, real Postgres, real checkPermission; only the session is faked:
 * B1  BIR 1601-C, SSS R1A and the alphalist refuse a role without REPORTS:READ,
 *     and let one with it through.
 * B2  the employee export refuses a role without EMPLOYEES:EXPORT.
 * B3  approval chains: a role without SETTINGS:CREATE cannot create one (and
 *     nothing is written); a role with it can.
 * B4  approving a salary movement needs EMPLOYEES:APPROVE.
 * B5  salaries (employment terms) need PAYROLL:READ: EMPLOYEES:READ alone is
 *     not enough.
 * B6  loans need PAYROLL:READ.
 * B7  an account with no role is refused; SUPER_ADMIN passes.
 * B8  submitting someone else's expense claim is refused (ruling B6).
 * B9  the company payroll rules (settings/tenant) need SETTINGS:READ (Mark,
 *     10 Nov: lock it).
 * B10 the org chart is read-only for everyone (Mark, 10 Nov): any role can
 *     read it; changing a reporting line needs EMPLOYEES:UPDATE.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import pg from "pg";

vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { getAuthContext } from "@/lib/auth";
import prismaAdmin from "@/lib/prisma-admin";
import { GET as bir1601c } from "@/app/api/payroll/reports/bir/1601c/route";
import { GET as sssR1a } from "@/app/api/payroll/reports/sss/r1a/route";
import { GET as alphalist } from "@/app/api/payroll/reports/bir/alphalist/route";
import { GET as employeeExport } from "@/app/api/employees/export/route";
import { POST as createWorkflow } from "@/app/api/approval-workflows/route";
import { POST as approveMovement } from "@/app/api/movements/[id]/approve/route";
import { GET as employmentTerms } from "@/app/api/employees/[id]/employment-terms/route";
import { GET as listLoans } from "@/app/api/loans/route";
import { POST as submitExpense } from "@/app/api/expense-claims/[id]/submit/route";
import { GET as tenantSettings } from "@/app/api/settings/tenant/route";
import { GET as orgChart } from "@/app/api/org-chart/route";
import { PATCH as reassign } from "@/app/api/org-chart/reassign/route";

// ── S1: the static gate ──────────────────────────────────────────────────────

/** Route trees that are not signed-in TENANT dashboard routes, and why. */
const NOT_TENANT = /^src\/app\/api\/(ess|kiosk|auth|admin|health)\//;
// ess: ESS bearer sessions, own records only (units 0.14, 0.19, 0.22)
// kiosk: kiosk device + kiosk PIN (unit 0.18)
// auth: sign-in itself
// admin: Central Portal, guarded by src/lib/central-permission.ts
// health: liveness probe, no data

const SIGNED_IN = /getAuthContext\(|\bauth\(\)/;
const GUARD =
  /requirePermission\(|checkPermission\(|forbidUnless\(|holdsAny\(|holdsPermission\(|holdsApprovePermission\(|requireApprover\(|maySeeEmployeeRecords\(|maySeeAllRecords\(|mayApproveFor\(|isTenantOwner\(|callerEmployeeId\(|isSelfAction\(|@permission-exempt: \S/;

function unguardedHandlers(): string[] {
  const files = execSync("git ls-files 'src/app/api/**/route.ts'", { encoding: "utf8" }).trim().split("\n");
  const bad: string[] = [];
  for (const f of files) {
    if (NOT_TENANT.test(f)) continue;
    const src = readFileSync(f, "utf8");
    for (const part of src.split(/(?=export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b)/)) {
      const m = part.match(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/);
      if (!m) continue;
      if (SIGNED_IN.test(part) && !GUARD.test(part)) bad.push(`${m[1]} ${f}`);
    }
  }
  return bad;
}

describe("unit 0.25 S1: no tenant handler checks only sign-in", () => {
  it("S1 every signed-in tenant handler has a permission check, an own-records check, or a stated exemption", () => {
    expect(unguardedHandlers()).toEqual([]);
  });
});

// ── B1 to B8: real routes ────────────────────────────────────────────────────

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `u25t${sfx}`;
const ROLE = {
  narrow: `u25narrow${sfx}`, // TIMESHEETS:READ only, e.g. a timekeeper
  reports: `u25reports${sfx}`,
  exporter: `u25export${sfx}`,
  settings: `u25settings${sfx}`,
  hrRead: `u25hrread${sfx}`,
  payrollRead: `u25payroll${sfx}`,
  approver: `u25approve${sfx}`,
  settingsRead: `u25setread${sfx}`,
  hrEdit: `u25hredit${sfx}`,
} as const;
const GRANTS: Record<keyof typeof ROLE, [string, string][]> = {
  narrow: [["TIMESHEETS", "READ"]],
  reports: [["REPORTS", "READ"]],
  exporter: [["EMPLOYEES", "EXPORT"]],
  settings: [["SETTINGS", "CREATE"]],
  hrRead: [["EMPLOYEES", "READ"]],
  payrollRead: [["PAYROLL", "READ"]],
  approver: [["EMPLOYEES", "APPROVE"]],
  settingsRead: [["SETTINGS", "READ"]],
  hrEdit: [["EMPLOYEES", "UPDATE"]],
};
const USER = `u25u${sfx}`;
const EMP_ME = `u25me${sfx}`;
const EMP_OTHER = `u25ot${sfx}`;

let admin: pg.Client;
const as = (roleId: string | null, systemRole = "TENANT_USER") =>
  vi.mocked(getAuthContext).mockResolvedValue({ tenantId: T, userId: USER, systemRole, roleId } as never);
/** A request with the `nextUrl` some handlers read (NextRequest's, without next/server). */
const get = (url = "http://test.local/api?year=2026&month=1") => Object.assign(new Request(url), { nextUrl: new URL(url) }) as never;
const post = (body: unknown) => new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describeDb("unit 0.25: the role decides, on the real routes", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `U25${sfx}`.toUpperCase()]);
    for (const [key, roleId] of Object.entries(ROLE)) {
      await admin.query(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $1, now())`, [roleId, T]);
      for (const [module, action] of GRANTS[key as keyof typeof ROLE]) {
        await admin.query(
          `INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = $2::"PermissionModule" AND action = $3::"PermissionAction"`,
          [roleId, module, action],
        );
      }
    }
    await admin.query(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "isActive", "updatedAt")
       VALUES ($1, $2, $3, 'x', 'U25', 'User', 'TENANT_USER', true, now())`,
      [USER, T, `${USER}@u25.test`],
    );
    for (const [id, userId] of [[EMP_ME, USER], [EMP_OTHER, null]] as const) {
      await admin.query(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt", "userId")
         VALUES ($1, $2, $1, 'U25', $1, '2026-01-05', now(), $3)`,
        [id, T, userId],
      );
    }
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "ExpenseClaim" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "ApprovalWorkflow" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("B1 statutory reports need REPORTS:READ", async () => {
    for (const route of [bir1601c, sssR1a, alphalist]) {
      as(ROLE.narrow);
      expect((await route(get())).status).toBe(403);
      as(ROLE.reports);
      expect((await route(get())).status).not.toBe(403);
    }
  });

  it("B2 the employee export needs EMPLOYEES:EXPORT", async () => {
    as(ROLE.narrow);
    expect((await employeeExport(get("http://test.local/api"))).status).toBe(403);
    as(ROLE.exporter);
    expect((await employeeExport(get("http://test.local/api"))).status).not.toBe(403);
  });

  it("B3 creating an approval chain needs SETTINGS:CREATE, and a refusal writes nothing", async () => {
    const count = async () =>
      Number((await admin.query(`SELECT count(*) FROM "ApprovalWorkflow" WHERE "tenantId" = $1`, [T])).rows[0].count);
    as(ROLE.narrow);
    expect((await createWorkflow(post({ code: "SNEAK", approvers: [{ roleKey: "ceo" }] }))).status).toBe(403);
    expect(await count()).toBe(0);
    as(ROLE.settings);
    const res = await createWorkflow(post({ code: "TWOLEVEL", approvers: [{ roleKey: "supervisor" }, { roleKey: "ceo" }] }));
    expect(res.status).toBeLessThan(300);
    expect(await count()).toBe(1);
  });

  it("B4 approving a movement needs EMPLOYEES:APPROVE", async () => {
    as(ROLE.narrow);
    expect((await approveMovement(post({}), params("no-such-movement"))).status).toBe(403);
    as(ROLE.approver);
    expect((await approveMovement(post({}), params("no-such-movement"))).status).toBe(404);
  });

  it("B5 salaries need PAYROLL:READ; EMPLOYEES:READ alone is not enough", async () => {
    as(ROLE.hrRead);
    expect((await employmentTerms(get("http://test.local/api"), params(EMP_OTHER))).status).toBe(403);
    as(ROLE.payrollRead);
    expect((await employmentTerms(get("http://test.local/api"), params(EMP_OTHER))).status).toBe(200);
  });

  it("B6 loans need PAYROLL:READ", async () => {
    as(ROLE.narrow);
    expect((await listLoans(get("http://test.local/api"))).status).toBe(403);
    as(ROLE.payrollRead);
    expect((await listLoans(get("http://test.local/api"))).status).toBe(200);
  });

  it("B7 no role is refused; SUPER_ADMIN passes", async () => {
    as(null);
    expect((await listLoans(get("http://test.local/api"))).status).toBe(403);
    as(null, "SUPER_ADMIN");
    expect((await listLoans(get("http://test.local/api"))).status).toBe(200);
  });

  it("B8 no one submits another employee's expense claim", async () => {
    const claim = `u25c${sfx}`;
    await admin.query(
      `INSERT INTO "ExpenseClaim" (id, "tenantId", "employeeId", category, "claimDate", description, "amountCents", status, "updatedAt")
       VALUES ($1, $2, $3, 'TRANSPORTATION', '2026-11-01', 'taxi', 10000, 'DRAFT', now())`,
      [claim, T, EMP_OTHER],
    );
    as(ROLE.payrollRead);
    expect((await submitExpense(post({}), params(claim))).status).toBe(403);
    expect((await admin.query(`SELECT status FROM "ExpenseClaim" WHERE id = $1`, [claim])).rows[0].status).toBe("DRAFT");
  });

  it("B9 the company payroll rules need SETTINGS:READ", async () => {
    as(ROLE.narrow);
    expect((await tenantSettings(get("http://test.local/api"))).status).toBe(403);
    as(ROLE.settingsRead);
    expect((await tenantSettings(get("http://test.local/api"))).status).toBe(200);
  });

  it("B10 the org chart is read-only for everyone; changing a reporting line needs EMPLOYEES:UPDATE", async () => {
    as(ROLE.narrow);
    expect((await orgChart(get("http://test.local/api"))).status).toBe(200);
    const before = (await admin.query(`SELECT "immediateSupervisorId" FROM "Employee" WHERE id = $1`, [EMP_OTHER])).rows[0];
    const move = () =>
      reassign(
        Object.assign(new Request("http://test.local/api", { method: "PATCH", body: JSON.stringify({ employeeId: EMP_OTHER, targetEmployeeId: EMP_ME }) }), {
          nextUrl: new URL("http://test.local/api"),
        }) as never,
      );
    expect((await move()).status).toBe(403);
    expect((await admin.query(`SELECT "immediateSupervisorId" FROM "Employee" WHERE id = $1`, [EMP_OTHER])).rows[0]).toEqual(before);
    as(ROLE.hrEdit);
    expect((await move()).status).toBe(200);
    expect((await admin.query(`SELECT "immediateSupervisorId" FROM "Employee" WHERE id = $1`, [EMP_OTHER])).rows[0].immediateSupervisorId).toBe(EMP_ME);
  });
});
