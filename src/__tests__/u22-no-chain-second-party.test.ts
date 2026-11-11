/**
 * Unit 0.22 and Amendment 1 (Mark's rulings B5 and B6, 10 Nov 2026).
 *
 * The fraud vector (R100): with no OT approval chain, an employee's own ESS
 * overtime self-approved onto the DTR. Checking the same fallback found it in
 * undertime, HR leave filing and DTR submission, and approve routes that
 * checked nothing.
 *
 * B5  With no chain nothing is approved at filing. It waits for the company
 *     OWNER (Tenant.ownerUserId) or a role granted the approve permission. The
 *     owner is always an approver. Never the requester.
 * B6  No one files for another employee (ESS only). No one sees another
 *     employee's records except the owner and roles granted the permission.
 *
 *   T1  ESS OT, no chain: PENDING, no DTR write.
 *   T2  ESS undertime, no chain: PENDING.
 *   T3  HR leave filing route: refused for everyone, even with LEAVES:APPROVE.
 *   T4  HR leave list: someone else's needs LEAVES:READ or owner; own is fine.
 *   T5  DTR submission: only one's own; with no chain it stays SUBMITTED.
 *   T6  Leave approve, no chain: needs owner or LEAVES:APPROVE; owner passes
 *       without the permission; never one's own.
 *   T7  Expense approve: checked nothing before; now never one's own, and only
 *       the owner or PAYROLL:APPROVE.
 *   T8  Expense claims: filing only for oneself; lists scoped to one's own
 *       without PAYROLL:READ.
 *   T9  Leave balance adjust: checked nothing before; now never one's own, and
 *       only the owner or LEAVES:UPDATE.
 *   T10 OT approve guard: the owner passes without TIMESHEETS:APPROVE; others
 *       without it are refused; self still refused.
 *
 * Real route handlers; the tenant transaction is a recording fake.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const T = "tenant22";
const EMP = "emp22self";
const OTHER = "emp22other";
const OWNER_USER = "user22owner";

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
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/approvals/snapshot", () => ({
  snapshotApprovalChain: vi.fn(async () => ({ activeSteps: 0, firstStepIndex: 0 })),
}));
vi.mock("@/lib/require-permission", () => ({
  checkPermission: vi.fn(async () => false),
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/leave/apply-to-dtr", () => ({ finalizeLeaveApproval: vi.fn(async () => {}) }));
vi.mock("@/lib/payroll/serialize", () => ({
  serializeLeaveTransaction: (r: unknown) => r,
  serializeExpenseClaim: (r: unknown) => r,
  serializeLeaveBalance: (r: unknown) => r,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));
vi.mock("@/lib/jobs/workers", () => ({
  enqueueDtrSubmitted: vi.fn(async () => {}),
  enqueueOtApproved: vi.fn(async () => {}),
}));
vi.mock("@/lib/dtr/submission-guard", () => ({
  findSubmissionBlockers: vi.fn(async () => []),
  describeBlockers: vi.fn(() => ""),
}));
vi.mock("@/lib/authz/self-approval", () => ({ isSelfAction: vi.fn() }));

import { getEssContext } from "@/lib/ess-auth";
import { getAuthContext } from "@/lib/auth";
import { checkPermission } from "@/lib/require-permission";
import { finalizeLeaveApproval } from "@/lib/leave/apply-to-dtr";
import { isSelfAction } from "@/lib/authz/self-approval";
import { POST as essOtPost } from "@/app/api/ess/ot-applications/route";
import { POST as essUndertimePost } from "@/app/api/ess/undertime/route";
import { GET as hrLeaveGet, POST as hrLeavePost } from "@/app/api/employees/[id]/leave-transactions/route";
import { POST as dtrSubmitPost } from "@/app/api/dtr/submissions/route";
import { POST as leaveApprovePost } from "@/app/api/leave-transactions/[id]/approve/route";
import { POST as expenseApprovePost } from "@/app/api/expense-claims/[id]/approve/route";
import { GET as expenseListGet, POST as expensePost } from "@/app/api/expense-claims/route";
import { PUT as leaveBalancePut } from "@/app/api/employees/[id]/leave-balances/route";
import { POST as otApprovePost } from "@/app/api/ot-applications/[id]/approve/route";

type Fn = ReturnType<typeof vi.fn>;
const fn = (f: unknown) => f as Fn;

const today = new Date().toISOString().slice(0, 10);
const req = (body: unknown, url = "http://test.local/api") =>
  Object.assign(new Request(url, { method: "POST", body: JSON.stringify(body) }), {
    nextUrl: new URL(url),
  }) as never;
const getReq = (url: string) => Object.assign(new Request(url), { nextUrl: new URL(url) }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const ops = () => calls.map((c) => c.op);
const argsOf = (op: string) => calls.filter((c) => c.op === op).map((c) => c.args as Record<string, unknown>);

/** A tenant user, their linked Employee (if any), whether they are the owner, and the permissions their role holds. */
function signIn(u: { employeeId: string | null; owner?: boolean; perms?: string[] }) {
  const userId = u.owner ? OWNER_USER : "user22staff";
  fn(getAuthContext).mockResolvedValue({ tenantId: T, userId, systemRole: "TENANT_USER", roleId: "role22" });
  fn(checkPermission).mockImplementation(async (_t: string, _r: string, m: string, a: string) =>
    (u.perms ?? []).includes(`${m}:${a}`),
  );
  handlers["tenant.findUnique"] = () => ({ ownerUserId: OWNER_USER });
  handlers["employee.findFirst"] = (args) => {
    const where = (args as { where: Record<string, unknown> }).where;
    if ("userId" in where) return u.employeeId ? { id: u.employeeId } : null;
    return { id: where.id ?? OTHER, tenantId: T };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  handlers = {};
  calls = [];
  fn(getEssContext).mockResolvedValue({ tenantId: T, employeeId: EMP });
});

describe("unit 0.22: ESS self-filed requests never self-approve", () => {
  it("T1 ESS OT with no chain stays PENDING and writes nothing to the DTR", async () => {
    handlers["oTApplication.create"] = () => ({ id: "ota22", status: "PENDING", employeeId: EMP });
    const res = await essOtPost(req({ date: today, hours: 8, justification: "Month-end close" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PENDING");
    expect(ops()).not.toContain("dTRRecord.upsert");
    expect(ops()).not.toContain("oTApplication.update");
  });

  it("T2 ESS undertime with no chain stays PENDING", async () => {
    handlers["undertimeRequest.create"] = () => ({ id: "ut22", status: "PENDING", employeeId: EMP });
    const res = await essUndertimePost(req({ date: today, undertimeMinutes: 120, reason: "Clinic appointment" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PENDING");
    expect(ops()).not.toContain("undertimeRequest.update");
  });
});

describe("unit 0.22 Am 1 (B6): no filing for, no viewing of, another employee", () => {
  it("T3 the HR leave filing route is refused for everyone, even with LEAVES:APPROVE", async () => {
    signIn({ employeeId: "emp22hr", owner: true, perms: ["LEAVES:APPROVE", "LEAVES:CREATE"] });
    const res = await hrLeavePost(req({}));
    expect(res.status).toBe(403);
    expect(ops()).not.toContain("leaveTransaction.create");
  });

  it("T4 someone else's leave list needs LEAVES:READ or the owner; one's own is fine", async () => {
    handlers["leaveTransaction.findMany"] = () => [];
    handlers["leaveTransaction.count"] = () => 0;
    const url = `http://test.local/api/employees/${OTHER}/leave-transactions`;
    signIn({ employeeId: "emp22staff" });
    expect((await hrLeaveGet(getReq(url), params(OTHER))).status).toBe(403);
    signIn({ employeeId: "emp22hr", perms: ["LEAVES:READ"] });
    expect((await hrLeaveGet(getReq(url), params(OTHER))).status).toBe(200);
    signIn({ employeeId: "emp22own", owner: true });
    expect((await hrLeaveGet(getReq(url), params(OTHER))).status).toBe(200);
    signIn({ employeeId: OTHER });
    expect((await hrLeaveGet(getReq(url), params(OTHER))).status).toBe(200);
  });

  it("T5 DTR: only one's own; with no chain it stays SUBMITTED", async () => {
    const body = { employeeId: OTHER, periodStart: "2026-11-01", periodEnd: "2026-11-15" };
    handlers["dTRSubmission.create"] = () => ({ id: "sub22", status: "SUBMITTED" });
    signIn({ employeeId: "emp22hr", perms: ["TIMESHEETS:APPROVE"] });
    fn(isSelfAction).mockResolvedValue(false);
    expect((await dtrSubmitPost(req(body))).status).toBe(403);
    expect(ops()).not.toContain("dTRSubmission.create");

    calls = [];
    signIn({ employeeId: OTHER });
    fn(isSelfAction).mockResolvedValue(true);
    await dtrSubmitPost(req(body));
    expect(ops()).toContain("dTRSubmission.create");
    expect(argsOf("dTRSubmission.update").map((u) => (u.data as { status?: string })?.status)).not.toContain("MANAGER_APPROVED");
  });

  it("T8 expense claims: filing only for oneself; lists scoped without PAYROLL:READ", async () => {
    signIn({ employeeId: "emp22hr", perms: ["PAYROLL:APPROVE"] });
    const res = await expensePost(req({ employeeId: OTHER, category: "TRAVEL", description: "Taxi", amount: 250, claimDate: today }));
    expect([403, 400]).toContain(res.status);
    expect(ops()).not.toContain("expenseClaim.create");

    handlers["expenseClaim.count"] = () => 0;
    handlers["expenseClaim.findMany"] = () => [];
    calls = [];
    signIn({ employeeId: "emp22staff" });
    await expenseListGet(getReq("http://test.local/api/expense-claims"));
    expect((argsOf("expenseClaim.findMany")[0].where as { employeeId?: string }).employeeId).toBe("emp22staff");
  });
});

describe("unit 0.22 Am 1 (B5): owner or permitted role approves; never self", () => {
  beforeEach(() => {
    handlers["leaveTransaction.findFirst"] = () => ({ id: "lt22", type: "USAGE", approvalStatus: "PENDING", employeeId: OTHER, currentStepIndex: 0 });
    handlers["approvalStep.findMany"] = () => [];
    handlers["leaveTransaction.update"] = (a) => ({ id: "lt22", ...(a as { data: object }).data });
  });

  it("T6 leave approve, no chain: refused without permission, allowed for the owner, never self", async () => {
    signIn({ employeeId: "emp22staff" });
    expect((await leaveApprovePost(req({}), params("lt22"))).status).toBe(403);
    expect(finalizeLeaveApproval).not.toHaveBeenCalled();

    signIn({ employeeId: OTHER, owner: true, perms: ["LEAVES:APPROVE"] });
    expect((await leaveApprovePost(req({}), params("lt22"))).status).toBe(403);

    signIn({ employeeId: "emp22own", owner: true });
    expect((await leaveApprovePost(req({}), params("lt22"))).status).toBe(200);
    expect(fn(finalizeLeaveApproval).mock.calls).toHaveLength(1);
  });

  it("T7 expense approve: never one's own; only the owner or PAYROLL:APPROVE", async () => {
    handlers["expenseClaim.findFirst"] = () => ({ id: "ec22", employeeId: OTHER, status: "SUBMITTED" });
    handlers["expenseClaim.update"] = (a) => ({ id: "ec22", ...(a as { data: object }).data });
    const body = { taxTreatment: "NONTAXABLE_REIMBURSEMENT" };

    signIn({ employeeId: "emp22staff" });
    expect((await expenseApprovePost(req(body), params("ec22"))).status).toBe(403);
    signIn({ employeeId: OTHER, perms: ["PAYROLL:APPROVE"] });
    expect((await expenseApprovePost(req(body), params("ec22"))).status).toBe(403);
    expect(ops()).not.toContain("expenseClaim.update");
    signIn({ employeeId: "emp22own", owner: true });
    expect((await expenseApprovePost(req(body), params("ec22"))).status).toBe(200);
    expect(ops()).toContain("expenseClaim.update");
  });

  it("T9 leave balance adjust: never one's own; only the owner or LEAVES:UPDATE", async () => {
    handlers["leaveType.findFirst"] = () => ({ id: "lvt22" });
    handlers["leaveBalance.upsert"] = () => ({ id: "lb22" });
    const body = { leaveTypeId: "cleavetype000000000000022", year: 2026, openingBalance: 30 };
    signIn({ employeeId: "emp22staff" });
    expect((await leaveBalancePut(req(body), params(OTHER))).status).toBe(403);
    signIn({ employeeId: OTHER, perms: ["LEAVES:UPDATE"] });
    expect((await leaveBalancePut(req(body), params(OTHER))).status).toBe(403);
    expect(ops()).not.toContain("leaveBalance.upsert");
    signIn({ employeeId: "emp22hr", perms: ["LEAVES:UPDATE"] });
    expect([200, 422]).toContain((await leaveBalancePut(req(body), params(OTHER))).status);
  });

  it("T10 OT approve guard: owner passes without TIMESHEETS:APPROVE; others refused; self refused", async () => {
    handlers["oTApplication.findFirst"] = () => ({ id: "ota22", status: "PENDING", employeeId: OTHER, date: new Date(), hours: 2 });
    handlers["oTApplication.update"] = (a) => ({ id: "ota22", employeeId: OTHER, date: new Date(), hours: 2, ...(a as { data: object }).data });
    signIn({ employeeId: "emp22staff" });
    expect((await otApprovePost(req({}), params("ota22"))).status).toBe(403);
    signIn({ employeeId: OTHER, owner: true });
    expect((await otApprovePost(req({}), params("ota22"))).status).toBe(403);
    calls = [];
    signIn({ employeeId: "emp22own", owner: true });
    expect((await otApprovePost(req({}), params("ota22"))).status).toBe(200);
    expect(ops()).toContain("oTApplication.update");
  });
});
