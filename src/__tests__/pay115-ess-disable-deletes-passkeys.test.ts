/**
 * PAY-115 (Mark's ruling, 15 Nov 2026): disabling ESS access deletes the
 * employee's passkeys, on every disable path.
 *
 *   K1  HR's "disable" deletes every passkey of THAT employee and audits the count.
 *   K2  "schedule" with a date already past disables now and deletes them too.
 *   K3  "schedule" in the future and "activate" delete nothing.
 *   K4  the hourly ess.deactivation sweep deletes them for each employee it disables.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const T = "tenant115";
const EMP = "emp115";

const state = vi.hoisted(() => {
  const s = {
    handlers: {} as Record<string, (args: unknown) => unknown>,
    calls: [] as { op: string; args: unknown }[],
    tx: null as unknown as Record<string, unknown>,
  };
  s.tx = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$transaction") return async (f: (t: unknown) => unknown) => f(s.tx);
        return new Proxy(
          {},
          {
            get: (_t2, method: string) => async (args: unknown) => {
              const op = `${model}.${method}`;
              s.calls.push({ op, args });
              return s.handlers[op] ? s.handlers[op](args) : { count: 0 };
            },
          },
        );
      },
    },
  );
  return s;
});

vi.mock("@/lib/with-tenant", () => ({
  withTenant: vi.fn(async (_t: string, fn: (t: unknown) => unknown) => fn(state.tx)),
}));
vi.mock("@/lib/prisma-admin", () => ({ default: state.tx }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.9" }));

import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";
import { POST as essAccess } from "@/app/api/employees/[id]/ess-access/route";
import { handleEssDeactivationSweep } from "@/lib/jobs/handlers/ess-deactivation";

type Fn = ReturnType<typeof vi.fn>;
const fn = (f: unknown) => f as Fn;
const ctx = { tenantId: T, userId: "hr115", systemRole: "TENANT_USER", roleId: "role115" };
const post = (body: unknown) =>
  essAccess(new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: EMP }),
  });
const deletes = () => state.calls.filter((c) => c.op === "essWebAuthnCredential.deleteMany").map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  state.calls.length = 0;
  state.handlers = {
    "employee.findFirst": () => ({ id: EMP, essAccessStatus: "ACTIVE", essEmailChoice: "PERSONAL", personalEmail: "a@example.com", workEmail: null }),
    "essWebAuthnCredential.deleteMany": () => ({ count: 2 }),
  };
  fn(requirePermission).mockResolvedValue({ ctx });
});

describe("PAY-115: disabling ESS deletes passkeys", () => {
  it("K1 disable deletes that employee's passkeys and audits the count", async () => {
    const res = await post({ action: "disable", reason: "end of contract" });
    expect(res.status).toBe(200);
    expect(deletes()).toEqual([{ where: { employeeId: EMP } }]);
    const audit = fn(writeAuditLog).mock.calls[0][0] as { changes: Record<string, unknown> };
    expect(audit.changes).toMatchObject({ essAction: "disable", passkeysRemoved: 2 });
  });

  it("K2 a schedule already in the past disables now and deletes them", async () => {
    const res = await post({ action: "schedule", deactivateAt: "2020-01-01T00:00:00Z", reason: "left" });
    expect(res.status).toBe(200);
    expect(deletes()).toEqual([{ where: { employeeId: EMP } }]);
  });

  it("K3 a future schedule and activate delete nothing", async () => {
    await post({ action: "schedule", deactivateAt: "2099-01-01T00:00:00Z", reason: "later" });
    await post({ action: "activate" });
    expect(deletes()).toEqual([]);
  });

  it("K4 the hourly sweep deletes them for each employee it disables", async () => {
    state.handlers["employee.findMany"] = () => [{ id: "e1" }, { id: "e2" }];
    await handleEssDeactivationSweep();
    expect(deletes()).toEqual([{ where: { employeeId: "e1" } }, { where: { employeeId: "e2" } }]);
    const disabled = state.calls.filter((c) => c.op === "employee.update").map((c) => (c.args as { where: { id: string } }).where.id);
    expect(disabled).toEqual(["e1", "e2"]);
  });
});
