/**
 * Unit 0.10, as REVISED by unit 0.15 Amendment 3 (Mark's ruling of 10 Nov 2026).
 *
 * Unit 0.10 split the ESS sign-in write in two: activation (INVITED to ACTIVE,
 * account state, must fail the login) and `essLastLoginAt` (bookkeeping, must
 * never fail it). Ruling B7 then moved activation OUT of sign-in entirely:
 * accepting the invitation is the only way an account becomes ACTIVE, and the
 * invitation is where the employee chooses their PIN. Birth-date sign-in is
 * gone (Am 3).
 *
 * So the activation half of 0.10 is retired with the activation it guarded,
 * and these tests pin what 0.10 still owns plus the rule that replaced it:
 *   T1   bookkeeping fails: login SUCCEEDS (fail-soft), reported, not alerted
 *   T2   an INVITED employee with a correct PIN is REFUSED: no session, and
 *        no activation write (the invitation is the only way in)
 *   T3   a sign-in never writes essAccessStatus or essActivatedAt
 *   T4   a wrong PIN is a 401, counts toward the lock, and writes nothing else
 *   T5   a birth date is no longer accepted as a credential
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

vi.mock("@/lib/ess-lockout", () => ({
  essLockedUntil: vi.fn(async () => null),
  recordEssFailure: vi.fn(async () => null),
  lockedMessage: vi.fn(() => "locked"),
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn(async () => {}) }));

import { POST } from "@/app/api/ess/auth/route";
import prismaAdmin from "@/lib/prisma-admin";
import { createEssSession, verifyEssPin } from "@/lib/ess-auth";
import { recordEssFailure } from "@/lib/ess-lockout";
import { captureError } from "@/lib/observability";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as {
  tenant: { findFirst: Fn };
  employee: { update: Fn };
  $queryRaw: Fn;
};
const session = createEssSession as unknown as Fn;
const pinOk = verifyEssPin as unknown as Fn;
const failure = recordEssFailure as unknown as Fn;
const capture = captureError as unknown as Fn;

function employeeRow(essAccessStatus: string) {
  return {
    id: "emp_1",
    essPin: "$2a$10$hashedpin",
    essPasswordHash: null,
    deletedAt: null,
    employmentStatus: "ACTIVE",
    essAccessStatus,
    essDeactivateAt: null,
  };
}

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const CREDS = { companyCode: "DEMOCORP", employeeNumber: "E001", pin: "480213" };

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
  pinOk.mockResolvedValue(true);
  arrive("ACTIVE");
});

describe("unit 0.10 (revised by 0.15 Am 3): ESS sign-in", () => {
  it("T1: a failing essLastLoginAt write does not fail the login", async () => {
    db.employee.update.mockRejectedValue(new Error("db blip on bookkeeping"));

    const res = await POST(request(CREDS));

    expect(res.status).toBe(200);
    expect(session).toHaveBeenCalledWith("ten_1", "emp_1");
  });

  it("T1b: the bookkeeping failure is reported, not swallowed, and not as an alert", async () => {
    db.employee.update.mockRejectedValue(new Error("db blip on bookkeeping"));

    await POST(request(CREDS));

    const ctx = capture.mock.calls.map((c) => c[1] as { scope: string; critical?: boolean }).find((c) => c.scope === "ess/auth:lastLogin");
    expect(ctx).toBeDefined();
    expect(ctx!.critical).toBeFalsy();
  });

  it("T2: an INVITED employee with a correct PIN is REFUSED, gets no session, and is not activated", async () => {
    arrive("INVITED");

    const res = await POST(request(CREDS));

    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
    expect(updateData().some((d) => "essAccessStatus" in d || "essActivatedAt" in d)).toBe(false);
  });

  it("T3: a successful sign-in writes only bookkeeping, never account state", async () => {
    const res = await POST(request(CREDS));

    expect(res.status).toBe(200);
    for (const d of updateData()) {
      expect(d).not.toHaveProperty("essAccessStatus");
      expect(d).not.toHaveProperty("essActivatedAt");
    }
    expect(updateData().find((d) => "essLastLoginAt" in d)).toBeDefined();
  });

  it("T4: a wrong PIN is a 401, counts toward the lock, and writes nothing else", async () => {
    pinOk.mockResolvedValue(false);

    const res = await POST(request(CREDS));

    expect(res.status).toBe(401);
    expect(session).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it("T5: a birth date is no longer a credential", async () => {
    const res = await POST(request({ companyCode: "DEMOCORP", employeeNumber: "E001", birthDate: "1990-04-01" }));

    expect(res.status).toBe(400);
    expect(session).not.toHaveBeenCalled();
  });
});
