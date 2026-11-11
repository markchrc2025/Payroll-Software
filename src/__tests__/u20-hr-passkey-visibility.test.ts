/**
 * Unit 0.20: HR can see, and remove, an employee's ESS passkeys.
 *
 * R70 found that no HR surface showed an employee's registered WebAuthn
 * credentials, so offboarding could finish every step the product offers and
 * leave a passkey in place with no sign it exists. R75 downgraded it: after
 * 0.14 a surviving passkey no longer grants access by itself. What remains is
 * visibility and lifecycle, which this unit builds.
 *
 *   P1  GET lists metadata scoped to tenant AND employee, never the public
 *       key or credential id, and needs EMPLOYEES:READ.
 *   P2  GET for an employee outside the tenant (or deleted) is 404.
 *   P3  DELETE removes a credential only when it belongs to THAT employee in
 *       THAT tenant, needs EMPLOYEES:UPDATE, and is audit-logged.
 *   P4  DELETE of another employee's credential id deletes nothing: 404.
 *   P5  the ESS admin list carries passkeyCount per employee.
 *
 * NOT decided here (a product ruling never made): whether disabling ESS
 * should delete passkeys or leave them. The dialog says plainly that it does
 * not remove them.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const T = "tenant20";
const EMP = "emp20";

type Handler = (args: unknown) => unknown;
let handlers: Record<string, Handler> = {};
let calls: { op: string; args: unknown }[] = [];
const tx = new Proxy(
  {},
  {
    get: (_t, model: string) =>
      new Proxy(
        {},
        {
          get: (_t2, method: string) => async (args: unknown) => {
            const op = `${model}.${method}`;
            calls.push({ op, args });
            return handlers[op] ? handlers[op](args) : null;
          },
        },
      ),
  },
);

vi.mock("@/lib/with-tenant", () => ({
  withTenant: vi.fn(async (_t: string, fn: (t: unknown) => unknown) => fn(tx)),
}));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.7" }));

import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";
import { GET as listPasskeys } from "@/app/api/employees/[id]/passkeys/route";
import { DELETE as removePasskey } from "@/app/api/employees/[id]/passkeys/[credentialId]/route";
import { GET as essList } from "@/app/api/employees/ess/route";

type Fn = ReturnType<typeof vi.fn>;
const fn = (f: unknown) => f as Fn;
const ctx = { tenantId: T, userId: "hr20", systemRole: "TENANT_USER", roleId: "role20" };
const req = (url = "http://test.local/api") =>
  Object.assign(new Request(url), { nextUrl: new URL(url) }) as never;
const ops = () => calls.map((c) => c.op);
const argsOf = (op: string) => calls.filter((c) => c.op === op).map((c) => c.args as { where: Record<string, unknown> });

beforeEach(() => {
  vi.clearAllMocks();
  handlers = {};
  calls = [];
  fn(requirePermission).mockResolvedValue({ ctx });
});

describe("unit 0.20: HR passkey visibility", () => {
  it("P1 lists metadata only, scoped to tenant and employee, behind EMPLOYEES:READ", async () => {
    handlers["employee.findFirst"] = () => ({ id: EMP });
    handlers["essWebAuthnCredential.findMany"] = () => [
      { id: "c1", label: "iPhone", aaguid: "aa-1", createdAt: new Date("2026-10-01T00:00:00Z"), lastUsedAt: null },
    ];
    const res = await listPasskeys(req(), { params: Promise.resolve({ id: EMP }) });
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "EMPLOYEES", "READ");

    const q = calls.find((c) => c.op === "essWebAuthnCredential.findMany")!.args as {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    };
    expect(q.where).toEqual({ tenantId: T, employeeId: EMP });
    expect(Object.keys(q.select).sort()).toEqual(["aaguid", "createdAt", "id", "label", "lastUsedAt"]);

    const body = await res.json();
    expect(body.data).toEqual([
      { id: "c1", label: "iPhone", aaguid: "aa-1", createdAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/publicKey|credentialId/);
  });

  it("P1b refuses without EMPLOYEES:READ", async () => {
    fn(requirePermission).mockResolvedValue(new Response(null, { status: 403 }));
    const res = await listPasskeys(req(), { params: Promise.resolve({ id: EMP }) });
    expect(res.status).toBe(403);
    expect(ops()).toEqual([]);
  });

  it("P2 an employee not in this tenant is 404", async () => {
    handlers["employee.findFirst"] = () => null;
    const res = await listPasskeys(req(), { params: Promise.resolve({ id: "elsewhere" }) });
    expect(res.status).toBe(404);
    expect(ops()).not.toContain("essWebAuthnCredential.findMany");
  });

  it("P3 removes the employee's own credential, behind EMPLOYEES:UPDATE, audit-logged", async () => {
    handlers["essWebAuthnCredential.findFirst"] = () => ({ id: "c1", label: "iPhone" });
    handlers["essWebAuthnCredential.deleteMany"] = () => ({ count: 1 });
    const res = await removePasskey(req(), { params: Promise.resolve({ id: EMP, credentialId: "c1" }) });
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "EMPLOYEES", "UPDATE");
    expect(argsOf("essWebAuthnCredential.deleteMany")[0].where).toEqual({ id: "c1", employeeId: EMP, tenantId: T });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T, actorUserId: "hr20", action: "DELETE", entity: "EssWebAuthnCredential", entityId: "c1" }),
    );
  });

  it("P4 another employee's credential id deletes nothing and is 404", async () => {
    handlers["essWebAuthnCredential.findFirst"] = () => null;
    const res = await removePasskey(req(), { params: Promise.resolve({ id: EMP, credentialId: "someone-elses" }) });
    expect(res.status).toBe(404);
    expect(ops()).not.toContain("essWebAuthnCredential.deleteMany");
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("P5 the ESS admin list carries passkeyCount", async () => {
    handlers["employee.findMany"] = () => [
      {
        id: EMP, employeeNumber: "E-20", firstName: "Ana", lastName: "Cruz", workEmail: "ana@x.test",
        employmentStatus: "REGULAR", essAccessStatus: "DISABLED", essInvitedAt: null, essActivatedAt: null,
        essLastLoginAt: null, essDeactivateAt: null, essDeactivateReason: null, essPin: null,
        _count: { essWebAuthnCredentials: 2 },
      },
    ];
    const res = await essList(req("http://test.local/api/employees/ess"));
    const body = await res.json();
    expect(body.data[0].passkeyCount).toBe(2);
    const sel = (calls.find((c) => c.op === "employee.findMany")!.args as { select: Record<string, unknown> }).select;
    expect(sel._count).toEqual({ select: { essWebAuthnCredentials: true } });
  });
});
