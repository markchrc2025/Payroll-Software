/**
 * Unit 0.19 — an ESS session must be checked against LIVE state, not frozen
 * entitlement from sign-in.
 *
 * `getEssContext` validated only `tokenHash`, `expiresAt` and `revokedAt`. All
 * 29 ESS routes authenticate through it, so the access gates were enforced at
 * sign-in and NEVER AGAIN. An employee terminated mid-session kept full ESS
 * access until the token expired — 8h by default — and nothing revokes sessions
 * on a plain `employmentStatus` change. HR's explicit ESS-disable revokes;
 * termination, soft-delete, a movement, a bulk import and the employee PATCH
 * all do not.
 *
 * R82 re-scoped this from disclosure to CORRUPTION plus disclosure:
 * `/api/ess/ot-applications` lets an ESS-authenticated employee file overtime
 * that, on a tenant with no OT approval chain configured, AUTO-APPROVES and
 * writes `otMinutes` straight onto a `DTRRecord` — which flows into payroll.
 * T2 is that half.
 *
 * The fix is PULL, not push: the session lookup already runs as raw SQL, so the
 * employee row joins into the SAME query and every request re-checks live state
 * at zero extra round trips. Push (revoke-on-termination) is already
 * demonstrably incomplete — see the unit report's A3 table.
 *
 * These tests drive the real exported `getEssContext` and the real OT route.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma-admin", () => ({
  default: { $queryRaw: vi.fn() },
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn(async () => {}) }));

import { getEssContext } from "@/lib/ess-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { captureError } from "@/lib/observability";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as { $queryRaw: Fn };
const capture = captureError as unknown as Fn;

const TENANT = "ten_1";
const EMP = "emp_1";

/**
 * One joined row: the session columns `getEssContext` has always selected, plus
 * the employee columns the gate needs. Returning the superset means these tests
 * are meaningful against the OLD code too — it simply ignores the employee
 * columns and hands back a context regardless, which is the bug.
 */
function joinedRow(over: Record<string, unknown> = {}) {
  return {
    id: "sess_1",
    tenantId: TENANT,
    employeeId: EMP,
    deletedAt: null,
    employmentStatus: "REGULAR",
    essAccessStatus: "ACTIVE",
    essDeactivateAt: null,
    ...over,
  };
}

function arrive(over: Record<string, unknown> = {}) {
  db.$queryRaw.mockResolvedValue([joinedRow(over)]);
}

function request() {
  return {
    headers: new Headers({ authorization: "Bearer raw-token-abc" }),
  } as unknown as Parameters<typeof getEssContext>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  arrive();
});

describe("unit 0.19 — ESS sessions are re-checked against live state", () => {
  // -------------------------------------------------------------------
  // T1 — the whole unit. Session minted while employed; terminated after.
  // -------------------------------------------------------------------
  it("T1: an employee TERMINATED after their session was minted is refused on the next request", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    const ctx = await getEssContext(request());

    expect(ctx).toBeNull();
  });

  // -------------------------------------------------------------------
  // T3 — each gate independently, mid-session.
  // -------------------------------------------------------------------
  it("T3a: a soft-deleted employee is refused mid-session", async () => {
    arrive({ deletedAt: new Date("2026-01-01T00:00:00.000Z") });
    expect(await getEssContext(request())).toBeNull();
  });

  it("T3b: essAccessStatus DISABLED is refused mid-session", async () => {
    arrive({ essAccessStatus: "DISABLED" });
    expect(await getEssContext(request())).toBeNull();
  });

  it("T3c: essAccessStatus NOT_INVITED is refused mid-session", async () => {
    arrive({ essAccessStatus: "NOT_INVITED" });
    expect(await getEssContext(request())).toBeNull();
  });

  it("T3d: a past essDeactivateAt is refused mid-session", async () => {
    arrive({ essDeactivateAt: new Date(Date.now() - 60_000) });
    expect(await getEssContext(request())).toBeNull();
  });

  it("T3e: RESIGNED and RETIRED are refused too, not just TERMINATED", async () => {
    for (const status of ["RESIGNED", "RETIRED"]) {
      arrive({ employmentStatus: status });
      expect(await getEssContext(request()), `${status} must be refused`).toBeNull();
    }
  });

  // -------------------------------------------------------------------
  // T4 — the guard against over-correcting into mass logouts.
  // -------------------------------------------------------------------
  it("T4: a still-employed ACTIVE employee's session keeps working", async () => {
    const ctx = await getEssContext(request());
    expect(ctx).toEqual({ tenantId: TENANT, employeeId: EMP });
  });

  it("T4b: every still-employed status keeps its session", async () => {
    for (const status of ["PROBATIONARY", "REGULAR", "CONTRACTUAL", "PROJECT_BASED"]) {
      arrive({ employmentStatus: status });
      expect(await getEssContext(request()), `${status} must keep working`).toEqual({
        tenantId: TENANT,
        employeeId: EMP,
      });
    }
  });

  it("T4c: an INVITED employee mid-session is not locked out", async () => {
    arrive({ essAccessStatus: "INVITED" });
    expect(await getEssContext(request())).toEqual({ tenantId: TENANT, employeeId: EMP });
  });

  it("T4d: a FUTURE essDeactivateAt does not end the session early", async () => {
    arrive({ essDeactivateAt: new Date(Date.now() + 86_400_000) });
    expect(await getEssContext(request())).toEqual({ tenantId: TENANT, employeeId: EMP });
  });

  // A missing/expired/revoked session is still simply absent, as before.
  it("an absent session is still null, and no gate work is attempted", async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect(await getEssContext(request())).toBeNull();
  });

  it("a request with no Bearer header short-circuits without querying", async () => {
    const ctx = await getEssContext({ headers: new Headers({}) } as unknown as Parameters<typeof getEssContext>[0]);
    expect(ctx).toBeNull();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // A1 — the cost claim, asserted rather than argued: ONE round trip.
  // -------------------------------------------------------------------
  it("A1: re-checking costs no extra round trip — still exactly one query", async () => {
    arrive({ employmentStatus: "TERMINATED" });
    await getEssContext(request());
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // B3 — a session refused mid-flight is security-relevant.
  // -------------------------------------------------------------------
  it("B3: a mid-session refusal is captured as critical", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    await getEssContext(request());

    const critical = capture.mock.calls
      .map((c) => c[1] as { scope: string; critical?: boolean })
      .find((ctx) => ctx.critical === true);
    expect(critical).toBeDefined();
    expect(critical!.scope).toContain("ess");
  });

  it("B3b: a healthy session captures nothing", async () => {
    await getEssContext(request());
    expect(capture).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T2 — the CORRUPTION half (R82).
//
// /api/ess/ot-applications auto-approves a filed OT application when the tenant
// has no approval chain configured, writing `otMinutes` straight onto a
// DTRRecord — creating one with dayStatus REST_DAY if the date has none. That
// is payroll-bearing data an employee originates. A terminated employee holding
// a live session must not reach it.
// ---------------------------------------------------------------------------
describe("unit 0.19 — T2: the OT path is covered, and writes no DTRRecord", () => {
  it("T2: a terminated employee mid-session is refused on ess/ot-applications, and no DTRRecord is written", async () => {
    vi.resetModules();

    const dTRRecord = { upsert: vi.fn(), create: vi.fn(), update: vi.fn() };
    const oTApplication = { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.doMock("@/lib/with-tenant", () => ({
      withTenant: vi.fn(async (_t: string, fn: (tx: unknown) => unknown) =>
        fn({ dTRRecord, oTApplication, employee: { findFirst: vi.fn() },
             employeeShiftAssignment: { findFirst: vi.fn() } }),
      ),
    }));

    const { POST: otPost } = await import("@/app/api/ess/ot-applications/route");
    const freshDb = (await import("@/lib/prisma-admin")).default as unknown as { $queryRaw: Fn };
    // Valid, unexpired, unrevoked session — but the employee is TERMINATED.
    freshDb.$queryRaw.mockResolvedValue([joinedRow({ employmentStatus: "TERMINATED" })]);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const res = await otPost({
      headers: new Headers({ authorization: "Bearer raw-token-abc" }),
      json: async () => ({ date: yesterday, hours: "3.00", justification: "overtime" }),
    } as unknown as Parameters<typeof otPost>[0]);

    expect(res.status).toBe(401);
    // The corruption guarantee: nothing payroll-bearing was written.
    expect(dTRRecord.upsert).not.toHaveBeenCalled();
    expect(dTRRecord.create).not.toHaveBeenCalled();
    expect(oTApplication.create).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/with-tenant");
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// T6 — every path calls the SAME gate.
//
// As in 0.14's T6 and 0.18's T5: asserting that each surface refuses a
// terminated employee would pass just as well against a third copy of the
// checks, which is the failure mode these units keep closing. Replace the gate
// with a double and watch the surfaces move together.
// ---------------------------------------------------------------------------
describe("unit 0.19 — T6: the session re-check uses the one shared gate", () => {
  it("T6: replacing evaluateEssAccess changes BOTH getEssContext and the OT route", async () => {
    vi.resetModules();

    const actual = await vi.importActual<typeof import("@/lib/ess-access-gate")>(
      "@/lib/ess-access-gate",
    );
    const evaluateEssAccess = vi.fn(() => ({
      allowed: false as const,
      reason: "employment_ended" as const,
      status: 403,
      message: "Access denied — inactive employee",
    }));
    vi.doMock("@/lib/ess-access-gate", () => ({ ...actual, evaluateEssAccess }));

    const dTRRecord = { upsert: vi.fn(), create: vi.fn(), update: vi.fn() };
    const oTApplication = { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.doMock("@/lib/with-tenant", () => ({
      withTenant: vi.fn(async (_t: string, fn: (tx: unknown) => unknown) =>
        fn({ dTRRecord, oTApplication, employee: { findFirst: vi.fn() },
             employeeShiftAssignment: { findFirst: vi.fn() } }),
      ),
    }));

    const { getEssContext: freshCtx } = await import("@/lib/ess-auth");
    const { POST: otPost } = await import("@/app/api/ess/ot-applications/route");
    const freshDb = (await import("@/lib/prisma-admin")).default as unknown as { $queryRaw: Fn };
    // A PERFECTLY healthy employee. The only thing refusing is the shared gate.
    freshDb.$queryRaw.mockResolvedValue([joinedRow()]);

    const ctx = await freshCtx({
      headers: new Headers({ authorization: "Bearer raw-token-abc" }),
    } as unknown as Parameters<typeof freshCtx>[0]);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const res = await otPost({
      headers: new Headers({ authorization: "Bearer raw-token-abc" }),
      json: async () => ({ date: yesterday, hours: "3.00", justification: "overtime" }),
    } as unknown as Parameters<typeof otPost>[0]);

    expect(ctx).toBeNull();
    expect(res.status).toBe(401);
    expect(evaluateEssAccess).toHaveBeenCalledTimes(2);
    // Healthy record, yet nothing happened — impossible if either path carried
    // its own inline copy of the checks.
    expect(dTRRecord.upsert).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/ess-access-gate");
    vi.doUnmock("@/lib/with-tenant");
    vi.resetModules();
  });
});
