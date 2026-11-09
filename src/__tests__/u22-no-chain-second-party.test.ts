/**
 * Unit 0.22: with NO approval chain configured, a request is never approved by
 * the person it benefits.
 *
 * The fraud vector (R100): on any tenant with no OT approval chain, an
 * employee's own ESS overtime request self-approved and wrote otMinutes onto a
 * DTRRecord, the employee supplying the hours. The absence of configuration
 * was the trigger, so a tenant that had not finished setting up approvals was
 * the exposed case. The decision log said to CHECK the same fallback in leave
 * filing rather than assume; checking found four routes and two approve paths:
 *
 *   T1  ESS OT, no chain: stays PENDING; no DTRRecord write, no self-approval.
 *   T2  ESS undertime, no chain: stays PENDING (APPROVED undertime is excused).
 *   T3  HR leave filing, no chain, filer is the employee: stays PENDING.
 *   T4  HR leave filing, no chain, filer lacks LEAVES:APPROVE: stays PENDING.
 *   T5  HR leave filing, no chain, second party with LEAVES:APPROVE: approved
 *       at filing (the one-step HR path is kept).
 *   T6  DTR submission, no chain, own: stays SUBMITTED.
 *   T7  DTR submission, no chain, approver for someone else: final-approved.
 *   T8  Leave approve, no-workflow mode: refuses a caller without
 *       LEAVES:APPROVE (it checked nothing) and refuses one's own leave.
 *   T9  Undertime approve: refuses one's own request.
 *
 * Drives the real route handlers. The tenant transaction is a recording fake,
 * so each test asserts which writes happened, not just the response.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const T = "tenant22";
const EMP = "emp22self";
const OTHER = "emp22other";

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
vi.mock("@/lib/leave/filing", () => ({
  resolveOrCreateBalance: vi.fn(async () => ({ id: "bal22", available: 10 })),
  splitLeaveUnits: vi.fn((_avail: number, amount: number) => ({ paidUnits: amount, unpaidUnits: 0 })),
}));
vi.mock("@/lib/leave/apply-to-dtr", () => ({ finalizeLeaveApproval: vi.fn(async () => {}) }));
vi.mock("@/lib/payroll/serialize", () => ({ serializeLeaveTransaction: (r: unknown) => r }));
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
import { checkPermission, requirePermission } from "@/lib/require-permission";
import { finalizeLeaveApproval } from "@/lib/leave/apply-to-dtr";
import { isSelfAction } from "@/lib/authz/self-approval";
import { POST as essOtPost } from "@/app/api/ess/ot-applications/route";
import { POST as essUndertimePost } from "@/app/api/ess/undertime/route";
import { POST as hrLeavePost } from "@/app/api/employees/[id]/leave-transactions/route";
import { POST as dtrSubmitPost } from "@/app/api/dtr/submissions/route";
import { POST as leaveApprovePost } from "@/app/api/leave-transactions/[id]/approve/route";
import { POST as undertimeApprovePost } from "@/app/api/undertime-requests/[id]/approve/route";

type Fn = ReturnType<typeof vi.fn>;
const fn = (f: unknown) => f as Fn;

const today = new Date().toISOString().slice(0, 10);
const req = (body: unknown) =>
  new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const ops = () => calls.map((c) => c.op);
const updatesTo = (op: string) => calls.filter((c) => c.op === op).map((c) => c.args as { data?: Record<string, unknown> });

/** A tenant user. `employeeId` is the Employee record linked to them (or none). */
function signIn(user: { employeeId: string | null; canApprove: boolean }) {
  fn(getAuthContext).mockResolvedValue({ tenantId: T, userId: "user22", systemRole: "TENANT_USER", roleId: "role22" });
  fn(checkPermission).mockResolvedValue(user.canApprove);
  handlers["employee.findFirst"] = (args) => {
    const where = (args as { where: Record<string, unknown> }).where;
    if ("userId" in where) return user.employeeId ? { id: user.employeeId } : null;
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

describe("unit 0.22: HR leave filing with no chain needs a second party", () => {
  const body = { leaveTypeId: "cleavetype000000000000022", amount: 1, startDate: today, endDate: today };

  beforeEach(() => {
    handlers["leaveType.findFirst"] = () => ({ id: body.leaveTypeId, isPaid: true });
    handlers["leaveTransaction.create"] = () => ({ id: "lt22", approvalStatus: "PENDING" });
    handlers["leaveTransaction.update"] = (a) => ({ id: "lt22", ...(a as { data: object }).data });
  });

  it("T3 filer IS the employee (even with LEAVES:APPROVE): stays PENDING", async () => {
    signIn({ employeeId: EMP, canApprove: true });
    const res = await hrLeavePost(req(body), params(EMP));
    expect((await res.json()).data.approvalStatus).toBe("PENDING");
    expect(finalizeLeaveApproval).not.toHaveBeenCalled();
    expect(updatesTo("leaveTransaction.update")).toEqual([]);
  });

  it("T4 filer lacks LEAVES:APPROVE: stays PENDING", async () => {
    signIn({ employeeId: "emp22hr", canApprove: false });
    const res = await hrLeavePost(req(body), params(OTHER));
    expect((await res.json()).data.approvalStatus).toBe("PENDING");
    expect(finalizeLeaveApproval).not.toHaveBeenCalled();
  });

  it("T5 second party with LEAVES:APPROVE: approved at filing", async () => {
    signIn({ employeeId: "emp22hr", canApprove: true });
    const res = await hrLeavePost(req(body), params(OTHER));
    expect((await res.json()).data.approvalStatus).toBe("APPROVED");
    expect(fn(finalizeLeaveApproval).mock.calls).toHaveLength(1);
    expect(fn(finalizeLeaveApproval).mock.calls[0][0]).toBe(tx);
    expect(fn(finalizeLeaveApproval).mock.calls[0][1]).toBe("lt22");
    expect(checkPermission).toHaveBeenCalledWith(T, "role22", "LEAVES", "APPROVE");
  });
});

describe("unit 0.22: DTR submission with no chain", () => {
  const body = { employeeId: EMP, periodStart: "2026-11-01", periodEnd: "2026-11-15" };

  beforeEach(() => {
    handlers["dTRSubmission.create"] = () => ({ id: "sub22", status: "SUBMITTED" });
  });

  it("T6 one's own submission stays SUBMITTED", async () => {
    signIn({ employeeId: EMP, canApprove: true });
    fn(isSelfAction).mockResolvedValue(true);
    await dtrSubmitPost(req(body));
    const statuses = updatesTo("dTRSubmission.update").map((u) => u.data?.status);
    expect(statuses).not.toContain("MANAGER_APPROVED");
  });

  it("T7 an approver submitting for someone else is final-approved", async () => {
    signIn({ employeeId: "emp22hr", canApprove: true });
    fn(isSelfAction).mockResolvedValue(false);
    await dtrSubmitPost(req({ ...body, employeeId: OTHER }));
    const statuses = updatesTo("dTRSubmission.update").map((u) => u.data?.status);
    expect(statuses).toContain("MANAGER_APPROVED");
  });
});

describe("unit 0.22: approve routes refuse self-approval and unpermitted callers", () => {
  beforeEach(() => {
    handlers["leaveTransaction.findFirst"] = () => ({
      id: "lt22",
      type: "USAGE",
      approvalStatus: "PENDING",
      employeeId: OTHER,
      currentStepIndex: 0,
    });
    handlers["approvalStep.findMany"] = () => [];
    handlers["leaveTransaction.update"] = (a) => ({ id: "lt22", ...(a as { data: object }).data });
  });

  it("T8a leave approve, no-workflow mode: a caller without LEAVES:APPROVE is refused", async () => {
    signIn({ employeeId: "emp22staff", canApprove: false });
    const res = await leaveApprovePost(req({}), params("lt22"));
    expect(res.status).toBe(403);
    expect(updatesTo("leaveTransaction.update")).toEqual([]);
    expect(finalizeLeaveApproval).not.toHaveBeenCalled();
  });

  it("T8b leave approve: one's own leave is refused even with LEAVES:APPROVE", async () => {
    signIn({ employeeId: OTHER, canApprove: true });
    const res = await leaveApprovePost(req({}), params("lt22"));
    expect(res.status).toBe(403);
    expect(updatesTo("leaveTransaction.update")).toEqual([]);
  });

  it("T8c leave approve: a second party with LEAVES:APPROVE approves", async () => {
    signIn({ employeeId: "emp22hr", canApprove: true });
    const res = await leaveApprovePost(req({}), params("lt22"));
    expect(res.status).toBe(200);
    expect(fn(finalizeLeaveApproval).mock.calls).toHaveLength(1);
    expect(fn(finalizeLeaveApproval).mock.calls[0][0]).toBe(tx);
    expect(fn(finalizeLeaveApproval).mock.calls[0][1]).toBe("lt22");
  });

  it("T9 undertime approve: one's own request is refused", async () => {
    fn(requirePermission).mockResolvedValue({
      ctx: { tenantId: T, userId: "user22", systemRole: "TENANT_USER", roleId: "role22" },
    });
    handlers["undertimeRequest.findFirst"] = () => ({ id: "ut22", status: "PENDING", employeeId: EMP });
    handlers["employee.findFirst"] = () => ({ id: EMP });
    const res = await undertimeApprovePost(req({}), params("ut22"));
    expect(res.status).toBe(403);
    expect(ops()).not.toContain("undertimeRequest.update");
  });
});
