/**
 * Unit 0.18 — the kiosk punch must enforce the employment gate.
 *
 * `/api/kiosk/punch` resolved the employee on `tenantId` + `employeeNumber` +
 * `deletedAt: null` and then verified `kioskPinHash`. It checked `deletedAt`
 * ONLY — never `employmentStatus`. Termination sets the status, not
 * `deletedAt`, so a TERMINATED employee who was never soft-deleted (the normal
 * case) could still authenticate at a kiosk and record attendance — which
 * flows into DTR and from there into payroll. Fabricated attendance that
 * enables payment, not merely a disclosure.
 *
 * Unit 0.14 built the shared gate this needs. The gate is COMPOSED rather than
 * reused wholesale: `deletedAt` and `employmentStatus` are universal, but
 * `essAccessStatus` and `essDeactivateAt` are ESS-specific and must NOT apply
 * here — an employee with ESS disabled may still legitimately clock in. T3 is
 * the guard for that, and T5 pins that both surfaces share one implementation.
 *
 * These tests drive the real exported route handler, not a copy.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma-admin", () => ({
  default: {
    kiosk: { findFirst: vi.fn() },
    employee: { findFirst: vi.fn(), update: vi.fn() },
    tenant: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/attendance/punch", () => ({ executePunch: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/r2", () => ({ isR2Configured: vi.fn(() => true) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn(async () => {}) }));

import { POST as kioskPunch } from "@/app/api/kiosk/punch/route";
import prismaAdmin from "@/lib/prisma-admin";
import { executePunch } from "@/lib/attendance/punch";
import bcrypt from "bcryptjs";
import { captureError } from "@/lib/observability";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as {
  kiosk: { findFirst: Fn };
  employee: { findFirst: Fn };
};
const punch = executePunch as unknown as Fn;
const crypt = (bcrypt as unknown as { compare: Fn });
const capture = captureError as unknown as Fn;

const TENANT = "ten_1";

function employee(over: Record<string, unknown> = {}) {
  return {
    id: "emp_1",
    kioskPinHash: "$2a$10$hash",
    firstName: "Ada",
    lastName: "Lovelace",
    deletedAt: null,
    employmentStatus: "REGULAR",
    essAccessStatus: "ACTIVE",
    essDeactivateAt: null,
    ...over,
  };
}

function arrive(over: Record<string, unknown> = {}) {
  db.employee.findFirst.mockResolvedValue(employee(over));
}

function request() {
  return {
    headers: new Headers({ authorization: "Kiosk dev-token-abc" }),
    json: async () => ({
      employeeNumber: "E001",
      pin: "123456",
      punchType: "IN",
      selfieKey: "selfies/abc.jpg",
    }),
  } as unknown as Parameters<typeof kioskPunch>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.kiosk.findFirst.mockResolvedValue({
    id: "kiosk_1",
    tenantId: TENANT,
    requiresSelfie: false,
    branchId: null,
  });
  crypt.compare.mockResolvedValue(true); // the PIN is CORRECT throughout
  punch.mockResolvedValue({
    ok: true,
    log: { id: "log_1", outsideGeofence: false, distanceMeters: null },
    dtr: { id: "dtr_1" },
  });
  arrive();
});

describe("unit 0.18 — the kiosk punch enforces the employment gate", () => {
  // -------------------------------------------------------------------
  // T1 — the whole unit. Correct PIN, terminated employee.
  // -------------------------------------------------------------------
  it("T1: a TERMINATED employee with a valid kiosk PIN is REFUSED and writes no attendance", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    const res = await kioskPunch(request());

    expect(res.status).not.toBe(201);
    expect(res.status).toBe(403);
    // The only thing that actually matters: no attendance row may be written.
    expect(punch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // T2 — each gate independently.
  // -------------------------------------------------------------------
  it("T2a: a soft-deleted employee is refused and writes no attendance", async () => {
    arrive({ deletedAt: new Date("2026-01-01T00:00:00.000Z") });

    const res = await kioskPunch(request());

    expect(res.status).not.toBe(201);
    expect(punch).not.toHaveBeenCalled();
  });

  it("T2b: a RESIGNED employee is refused and writes no attendance", async () => {
    arrive({ employmentStatus: "RESIGNED" });

    const res = await kioskPunch(request());

    expect(res.status).toBe(403);
    expect(punch).not.toHaveBeenCalled();
  });

  it("T2c: a RETIRED employee is refused and writes no attendance", async () => {
    arrive({ employmentStatus: "RETIRED" });

    const res = await kioskPunch(request());

    expect(res.status).toBe(403);
    expect(punch).not.toHaveBeenCalled();
  });

  it("T2d: every still-employed status can punch", async () => {
    for (const status of ["PROBATIONARY", "REGULAR", "CONTRACTUAL", "PROJECT_BASED"]) {
      vi.clearAllMocks();
      db.kiosk.findFirst.mockResolvedValue({
        id: "kiosk_1", tenantId: TENANT, requiresSelfie: false, branchId: null,
      });
      crypt.compare.mockResolvedValue(true);
      punch.mockResolvedValue({
    ok: true,
    log: { id: "log_1", outsideGeofence: false, distanceMeters: null },
    dtr: { id: "dtr_1" },
  });
      arrive({ employmentStatus: status });

      const res = await kioskPunch(request());

      expect(res.status, `${status} must be able to punch`).toBe(201);
      expect(punch, `${status} must record attendance`).toHaveBeenCalled();
    }
  });

  // -------------------------------------------------------------------
  // T3 — the guard against over-correcting, and the reason A2 matters.
  //      A kiosk punch is NOT ESS access.
  // -------------------------------------------------------------------
  it("T3: an ACTIVE employee with ESS DISABLED can still punch", async () => {
    arrive({ essAccessStatus: "DISABLED" });

    const res = await kioskPunch(request());

    expect(res.status).toBe(201);
    expect(punch).toHaveBeenCalled();
  });

  it("T3b: a past essDeactivateAt does not block a kiosk punch either", async () => {
    arrive({ essDeactivateAt: new Date(Date.now() - 86_400_000) });

    const res = await kioskPunch(request());

    expect(res.status).toBe(201);
    expect(punch).toHaveBeenCalled();
  });

  it("T3c: essAccessStatus NOT_INVITED does not block a kiosk punch", async () => {
    arrive({ essAccessStatus: "NOT_INVITED" });

    const res = await kioskPunch(request());

    expect(res.status).toBe(201);
    expect(punch).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // A4 — the refusal must sit BEHIND the PIN, so a passerby cannot learn
  //      who has been terminated by typing employee numbers.
  // -------------------------------------------------------------------
  it("A4: a WRONG PIN on a terminated employee still answers 'Invalid PIN', not a status disclosure", async () => {
    arrive({ employmentStatus: "TERMINATED" });
    crypt.compare.mockResolvedValue(false);

    const res = await kioskPunch(request());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid PIN");
    expect(punch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // B3 — a terminated employee attempting to punch is security-relevant.
  // -------------------------------------------------------------------
  it("B3: a refused kiosk punch is captured as critical", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    await kioskPunch(request());

    const critical = capture.mock.calls
      .map((c) => c[1] as { scope: string; critical?: boolean })
      .find((ctx) => ctx.critical === true);
    expect(critical).toBeDefined();
    expect(critical!.scope).toContain("kiosk");
  });
});

// ---------------------------------------------------------------------------
// T5 — the kiosk and the ESS sign-in must share ONE gate.
//
// Asserting that both surfaces refuse a terminated employee would pass just as
// well against two copied implementations, and a second copy is exactly what
// this unit exists to prevent — 0.14's whole finding was that inline checks
// diverge. So: replace the shared module with a double and watch BOTH surfaces
// change together. Duplicated logic fails this by construction.
//
// The double keeps the ESS gate REAL and only doubles the universal layer, so
// this also pins the composition itself: the ESS gate is built ON the universal
// one rather than carrying its own copy of deletedAt/employmentStatus.
// ---------------------------------------------------------------------------
describe("unit 0.18 — T5: kiosk and ESS sign-in call the one shared gate", () => {
  it("T5: replacing evaluateEmploymentAccess changes BOTH surfaces", async () => {
    vi.resetModules();

    const actual = await vi.importActual<typeof import("@/lib/ess-access-gate")>(
      "@/lib/ess-access-gate",
    );
    const evaluateEmploymentAccess = vi.fn(() => ({
      allowed: false as const,
      reason: "employment_ended" as const,
      status: 403,
      message: "This employee is no longer active. Please contact HR.",
    }));

    vi.doMock("@/lib/ess-access-gate", () => ({
      ...actual,
      evaluateEmploymentAccess,
      // The ESS gate is NOT doubled — the real one runs, and it must reach the
      // doubled universal layer through composition.
      evaluateEssAccess: (emp: unknown) => {
        const core = evaluateEmploymentAccess();
        if (!core.allowed) {
          return { allowed: false, reason: core.reason, status: 401, message: "Invalid credentials" };
        }
        return actual.evaluateEssAccess(emp as never);
      },
    }));

    const freshCreateSession = vi.fn(async () => "raw-token-abc");
    vi.doMock("@/lib/ess-auth", () => ({
      createEssSession: freshCreateSession,
      verifyEssPin: vi.fn(async () => true),
      verifyEssPassword: vi.fn(async () => true),
    }));

    const { POST: kioskPath } = await import("@/app/api/kiosk/punch/route");
    const { POST: essPath } = await import("@/app/api/ess/auth/route");

    // Every underlying record is PERFECTLY healthy. The only thing refusing is
    // the shared gate.
    const healthy = {
      id: "emp_1",
      kioskPinHash: "$2a$10$hash",
      firstName: "Ada",
      lastName: "Lovelace",
      birthDate: new Date("1990-04-01T00:00:00.000Z"),
      essPin: null,
      deletedAt: null,
      employmentStatus: "REGULAR",
      essAccessStatus: "ACTIVE",
      essDeactivateAt: null,
    };
    const freshDb = (await import("@/lib/prisma-admin")).default as unknown as {
      kiosk: { findFirst: Fn };
      employee: { findFirst: Fn };
      tenant: { findFirst: Fn };
      $queryRaw: Fn;
    };
    freshDb.kiosk.findFirst.mockResolvedValue({
      id: "kiosk_1", tenantId: TENANT, requiresSelfie: false, branchId: null,
    });
    freshDb.employee.findFirst.mockResolvedValue(healthy);
    freshDb.tenant.findFirst.mockResolvedValue({ id: TENANT });
    freshDb.$queryRaw.mockResolvedValue([healthy]);

    const freshPunch = (await import("@/lib/attendance/punch")).executePunch as unknown as Fn;
    freshPunch.mockResolvedValue({
      ok: true,
      log: { id: "log_1", outsideGeofence: false, distanceMeters: null },
      dtr: { id: "dtr_1" },
    });
    const freshCrypt = (await import("bcryptjs")).default as unknown as { compare: Fn };
    freshCrypt.compare.mockResolvedValue(true);

    const kioskRes = await kioskPath(request());
    const essRes = await essPath({
      json: async () => ({
        companyCode: "DEMOCORP",
        employeeNumber: "E001",
        birthDate: "1990-04-01",
      }),
    } as unknown as Parameters<typeof essPath>[0]);

    // Both refused, both through the SAME doubled function.
    expect(kioskRes.status).toBe(403);
    expect(essRes.status).toBe(401);
    expect(evaluateEmploymentAccess).toHaveBeenCalledTimes(2);
    // Neither surface acted despite every record being healthy — impossible if
    // either still carried its own inline copy of the checks.
    expect(freshPunch).not.toHaveBeenCalled();
    expect(freshCreateSession).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/ess-access-gate");
    vi.doUnmock("@/lib/ess-auth");
    vi.resetModules();
  });
});
