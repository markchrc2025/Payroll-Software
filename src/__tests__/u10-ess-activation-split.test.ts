/**
 * Unit 0.10 — the ESS sign-in write must be split.
 *
 * POST /api/ess/auth used to record two very different things in ONE
 * `employee.update`:
 *
 *   • essLastLoginAt                      — bookkeeping
 *   • essAccessStatus INVITED → ACTIVE
 *     + essActivatedAt                    — account activation
 *
 * Unguarded, any failure of that call reaches the route's outer catch and
 * returns a 500, so a transient DB blip denies a login with correct
 * credentials. But the naive fix — wrapping the whole call in try/catch, as
 * unit 0.3 did for the tenant `lastLoginAt` — would be WORSE: an INVITED
 * employee could be handed a session while their activation silently never
 * happened, leaving a logged-in account permanently stuck at INVITED.
 *
 * So the two halves get opposite guarantees, and these tests pin both:
 *   T1  bookkeeping fails  → login SUCCEEDS, and activation still happened
 *   T2  activation fails   → login FAILS (no session issued)
 *
 * These tests drive the real exported route handler, not a copy.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma-admin", () => ({
  default: {
    tenant: { findFirst: vi.fn() },
    employee: { update: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/ess-auth", () => ({
  createEssSession: vi.fn(),
  verifyEssPin: vi.fn(),
  verifyEssPassword: vi.fn(),
}));

// The route reports through the unit 0.6 observability layer; assert on it
// rather than on console noise.
vi.mock("@/lib/observability", () => ({ captureError: vi.fn(async () => {}) }));

import { POST } from "@/app/api/ess/auth/route";
import prismaAdmin from "@/lib/prisma-admin";
import { createEssSession } from "@/lib/ess-auth";
import { captureError } from "@/lib/observability";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as {
  tenant: { findFirst: Fn };
  employee: { update: Fn };
  $queryRaw: Fn;
};
const session = createEssSession as unknown as Fn;
const capture = captureError as unknown as Fn;

const BIRTH_DATE = "1990-04-01";

function employeeRow(essAccessStatus: string) {
  return {
    id: "emp_1",
    birthDate: new Date(`${BIRTH_DATE}T00:00:00.000Z`),
    essPin: null,
    deletedAt: null,
    employmentStatus: "ACTIVE",
    essAccessStatus,
    essDeactivateAt: null,
  };
}

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const CREDS = {
  companyCode: "DEMOCORP",
  employeeNumber: "E001",
  birthDate: BIRTH_DATE,
};

/** Every `employee.update` call's `data` payload, in call order. */
function updateData(): Array<Record<string, unknown>> {
  return db.employee.update.mock.calls.map((c) => c[0].data as Record<string, unknown>);
}

function arrive(status: string) {
  db.$queryRaw.mockResolvedValue([employeeRow(status)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.tenant.findFirst.mockResolvedValue({ id: "ten_1" });
  db.employee.update.mockResolvedValue({});
  session.mockResolvedValue("raw-token-abc");
  arrive("INVITED");
});

describe("unit 0.10 — ESS sign-in splits activation from bookkeeping", () => {
  it("signs in an INVITED employee with a correct birth date", async () => {
    const res = await POST(request(CREDS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.token).toBe("raw-token-abc");
  });

  // ---------------------------------------------------------------------
  // T1 — the one that matters. Bookkeeping must never cost a valid login,
  // and must never take activation down with it.
  // ---------------------------------------------------------------------
  it("T1: a failing essLastLoginAt write does not fail the login, and the employee is still activated", async () => {
    db.employee.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      if ("essLastLoginAt" in args.data) throw new Error("db blip on bookkeeping");
      return {};
    });

    const res = await POST(request(CREDS));

    // The login succeeded.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.token).toBe("raw-token-abc");
    expect(session).toHaveBeenCalledWith("ten_1", "emp_1");

    // And activation still landed — in its OWN write, which did not reject.
    const activation = updateData().find((d) => "essAccessStatus" in d);
    expect(activation).toBeDefined();
    expect(activation!.essAccessStatus).toBe("ACTIVE");
    expect(activation!.essActivatedAt).toBeInstanceOf(Date);
    // The activation write must not be carrying the bookkeeping field with it —
    // that is the shape that made the two fail together.
    expect(activation).not.toHaveProperty("essLastLoginAt");
  });

  it("T1b: the bookkeeping failure is reported, not swallowed — and not as an alert", async () => {
    db.employee.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      if ("essLastLoginAt" in args.data) throw new Error("db blip on bookkeeping");
      return {};
    });

    await POST(request(CREDS));

    expect(capture).toHaveBeenCalled();
    const ctx = capture.mock.calls.at(-1)![1] as { scope: string; critical?: boolean };
    expect(ctx.scope).toContain("ess/auth");
    expect(ctx.critical).toBeFalsy(); // bookkeeping is a log line, not a page-someone alert
  });

  // ---------------------------------------------------------------------
  // T2 — the opposite guarantee, and the reason this unit exists.
  // ---------------------------------------------------------------------
  it("T2: a failing activation write FAILS the login", async () => {
    db.employee.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      if ("essAccessStatus" in args.data) throw new Error("db blip on activation");
      return {};
    });

    const res = await POST(request(CREDS));

    expect(res.status).toBe(500);
    // No session may be handed out for an account that never activated.
    expect(session).not.toHaveBeenCalled();
  });

  it("T2b: an activation failure is escalated as critical", async () => {
    db.employee.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      if ("essAccessStatus" in args.data) throw new Error("db blip on activation");
      return {};
    });

    await POST(request(CREDS));

    const activationCapture = capture.mock.calls
      .map((c) => c[1] as { scope: string; critical?: boolean })
      .find((ctx) => ctx.critical === true);
    expect(activationCapture).toBeDefined();
    expect(activationCapture!.scope).toContain("ess/auth");
  });

  // ---------------------------------------------------------------------
  // T3 / T4 — the behaviour the split must preserve.
  // ---------------------------------------------------------------------
  it("T3: an INVITED employee becomes ACTIVE with essActivatedAt set on first successful login", async () => {
    const res = await POST(request(CREDS));
    expect(res.status).toBe(200);

    const activation = updateData().find((d) => "essAccessStatus" in d);
    expect(activation).toBeDefined();
    expect(activation!.essAccessStatus).toBe("ACTIVE");
    expect(activation!.essActivatedAt).toBeInstanceOf(Date);

    // Bookkeeping still happens on the same login, just separately.
    const bookkeeping = updateData().find((d) => "essLastLoginAt" in d);
    expect(bookkeeping).toBeDefined();
    expect(bookkeeping!.essLastLoginAt).toBeInstanceOf(Date);
  });

  it("T3b: activation is written before the session is issued", async () => {
    const order: string[] = [];
    db.employee.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      order.push("essAccessStatus" in args.data ? "activation" : "bookkeeping");
      return {};
    });
    session.mockImplementation(async () => {
      order.push("session");
      return "raw-token-abc";
    });

    await POST(request(CREDS));

    expect(order.indexOf("activation")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("activation")).toBeLessThan(order.indexOf("session"));
  });

  it("T4: an already-ACTIVE employee's status and essActivatedAt are not rewritten", async () => {
    arrive("ACTIVE");

    const res = await POST(request(CREDS));
    expect(res.status).toBe(200);

    for (const d of updateData()) {
      expect(d).not.toHaveProperty("essAccessStatus");
      expect(d).not.toHaveProperty("essActivatedAt");
    }
    // Only the bookkeeping write should have run.
    expect(updateData()).toHaveLength(1);
    expect(updateData()[0].essLastLoginAt).toBeInstanceOf(Date);
  });

  it("T4b: an already-ACTIVE employee still signs in when bookkeeping fails", async () => {
    arrive("ACTIVE");
    db.employee.update.mockRejectedValue(new Error("db blip on bookkeeping"));

    const res = await POST(request(CREDS));

    expect(res.status).toBe(200);
    expect(session).toHaveBeenCalledWith("ten_1", "emp_1");
  });

  it("a wrong birth date is still a 401, and writes nothing", async () => {
    const res = await POST(request({ ...CREDS, birthDate: "1991-01-01" }));
    expect(res.status).toBe(401);
    expect(db.employee.update).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });
});
