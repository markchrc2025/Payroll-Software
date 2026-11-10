/**
 * Unit 0.14 — the WebAuthn ESS sign-in must enforce the same access gates as
 * the credential sign-in.
 *
 * `/api/ess/webauthn/authenticate/finish` is a SECOND, fully independent ESS
 * sign-in. It mints the same `EssSession` through the same `createEssSession`,
 * but it checked NONE of the gates `/api/ess/auth` enforces:
 *
 *   • deletedAt            — soft-deleted employee
 *   • employmentStatus     — RESIGNED / TERMINATED / RETIRED
 *   • essAccessStatus      — NOT_INVITED / DISABLED
 *   • essDeactivateAt      — scheduled deactivation already passed
 *
 * So a TERMINATED or DISABLED employee holding a registered passkey could sign
 * in and read their payroll data, and offboarding did not revoke it. The hourly
 * `ess.deactivation` sweep is no mitigation: it writes `essAccessStatus:
 * DISABLED`, a field this path never read.
 *
 * The fix is NOT four copied checks — the two paths diverged BECAUSE the gates
 * lived inline in one of them. They now share ONE implementation
 * (`evaluateEssAccess`), which T6 pins.
 *
 * These tests drive the real exported route handlers, not copies.
 *
 * EDITED under unit 0.15 Amendment 3 (Mark's ruling of 10 Nov 2026), the
 * only change to this guard: passkeys are OFF for now, so these tests switch
 * them on (`@/lib/ess-passkeys` mocked) to keep guarding the gate for the day
 * they return; B4 now pins that a passkey sign-in REFUSES an INVITED account
 * instead of activating it (ruling B7: only the invitation activates), and
 * B4b (activation failure) is retired with the activation it tested; T6 signs
 * in with a PIN because birth-date sign-in is gone.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma-admin", () => ({
  default: {
    tenant: { findFirst: vi.fn() },
    employee: { update: vi.fn(), findFirst: vi.fn() },
    essWebAuthnCredential: { findFirst: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/ess-auth", () => ({
  createEssSession: vi.fn(),
  verifyEssPin: vi.fn(),
  verifyEssPassword: vi.fn(),
}));

vi.mock("@/lib/webauthn-challenge", () => ({
  verifyChallenge: vi.fn(),
  issueChallenge: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn(async () => {}) }));

// Passkeys are off in the product (unit 0.15 Am 3); on here, so the gate the
// passkey path will need again stays guarded.
vi.mock("@/lib/ess-passkeys", () => ({ ESS_PASSKEYS_ENABLED: true, PASSKEYS_OFF_MESSAGE: "off" }));

import { POST as webauthnFinish } from "@/app/api/ess/webauthn/authenticate/finish/route";
import prismaAdmin from "@/lib/prisma-admin";
import { createEssSession } from "@/lib/ess-auth";
import { verifyChallenge } from "@/lib/webauthn-challenge";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { captureError } from "@/lib/observability";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as {
  employee: { update: Fn; findFirst: Fn };
  essWebAuthnCredential: { findFirst: Fn; update: Fn };
};
const session = createEssSession as unknown as Fn;
const challenge = verifyChallenge as unknown as Fn;
const assertion = verifyAuthenticationResponse as unknown as Fn;
const capture = captureError as unknown as Fn;

const TENANT = "ten_1";
const EMP = "emp_1";
const CRED_ID = "cred_abc";

/** A fully-entitled employee — every gate open. */
function employee(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: EMP,
    deletedAt: null,
    employmentStatus: "ACTIVE",
    essAccessStatus: "ACTIVE",
    essDeactivateAt: null,
    ...over,
  };
}

function request() {
  return {
    json: async () => ({
      challengeToken: "signed.challenge.token",
      response: { id: CRED_ID },
    }),
  } as unknown as Parameters<typeof webauthnFinish>[0];
}

/** Seat the employee the gate will read. */
function arrive(over: Partial<Record<string, unknown>> = {}) {
  db.employee.findFirst.mockResolvedValue(employee(over));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  challenge.mockReturnValue({ employeeId: EMP, tenantId: TENANT, challenge: "chal" });
  db.essWebAuthnCredential.findFirst.mockResolvedValue({
    credentialId: CRED_ID,
    publicKey: Buffer.from("pk").toString("base64url"),
    counter: 1n,
    employeeId: EMP,
    tenantId: TENANT,
  });
  // The passkey itself is genuine — possession is PROVEN. Everything these
  // tests assert is about entitlement, not identity.
  assertion.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 2 } });
  db.essWebAuthnCredential.update.mockResolvedValue({});
  db.employee.update.mockResolvedValue({});
  session.mockResolvedValue("raw-token-abc");
  arrive();
});

describe("unit 0.14 — the WebAuthn ESS sign-in enforces the access gates", () => {
  // -------------------------------------------------------------------
  // T1 — the whole unit. A terminated employee with a WORKING passkey.
  // -------------------------------------------------------------------
  it("T1: a TERMINATED employee with a valid passkey is REFUSED and gets no session", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    const res = await webauthnFinish(request());

    expect(res.status).not.toBe(200);
    expect(res.status).toBe(403);
    // The only thing that actually matters: no session may be minted.
    expect(session).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // T2 — one test per gate, so a single broken gate cannot hide behind
  //      another passing one.
  // -------------------------------------------------------------------
  it("T2a: a soft-deleted employee is refused and gets no session", async () => {
    arrive({ deletedAt: new Date("2026-01-01T00:00:00.000Z") });

    const res = await webauthnFinish(request());

    expect(res.status).not.toBe(200);
    expect(session).not.toHaveBeenCalled();
  });

  it("T2b: essAccessStatus DISABLED is refused and gets no session", async () => {
    arrive({ essAccessStatus: "DISABLED" });

    const res = await webauthnFinish(request());

    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
  });

  it("T2c: essAccessStatus NOT_INVITED is refused and gets no session", async () => {
    arrive({ essAccessStatus: "NOT_INVITED" });

    const res = await webauthnFinish(request());

    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
  });

  it("T2d: a past essDeactivateAt is refused and gets no session", async () => {
    arrive({ essDeactivateAt: new Date(Date.now() - 60_000) });

    const res = await webauthnFinish(request());

    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
  });

  it("T2e: RESIGNED and RETIRED are refused too, not just TERMINATED", async () => {
    for (const status of ["RESIGNED", "RETIRED"]) {
      vi.clearAllMocks();
      challenge.mockReturnValue({ employeeId: EMP, tenantId: TENANT, challenge: "chal" });
      db.essWebAuthnCredential.findFirst.mockResolvedValue({
        credentialId: CRED_ID,
        publicKey: Buffer.from("pk").toString("base64url"),
        counter: 1n,
        employeeId: EMP,
        tenantId: TENANT,
      });
      assertion.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 2 } });
      session.mockResolvedValue("raw-token-abc");
      arrive({ employmentStatus: status });

      const res = await webauthnFinish(request());

      expect(res.status, `${status} must be refused`).toBe(403);
      expect(session, `${status} must get no session`).not.toHaveBeenCalled();
    }
  });

  // A future deactivation date is NOT yet a refusal — the guard must be
  // "already passed", not "is set".
  it("T2f: a FUTURE essDeactivateAt still permits sign-in", async () => {
    arrive({ essDeactivateAt: new Date(Date.now() + 86_400_000) });

    const res = await webauthnFinish(request());

    expect(res.status).toBe(200);
    expect(session).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // T3 — the guard against over-correcting into a lockout.
  // -------------------------------------------------------------------
  it("T3: a legitimately ACTIVE employee still signs in via passkey", async () => {
    const res = await webauthnFinish(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.token).toBe("raw-token-abc");
    expect(session).toHaveBeenCalledWith(TENANT, EMP);
  });

  // -------------------------------------------------------------------
  // T5 — the replay guard survives. The counter write is NOT bookkeeping.
  // -------------------------------------------------------------------
  it("T5: the counter write still FAILS the login when it throws", async () => {
    db.essWebAuthnCredential.update.mockRejectedValue(new Error("db blip on counter"));

    const res = await webauthnFinish(request());

    expect(res.status).toBe(500);
    expect(session).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Refusals are security-relevant events, not routine 401s (B5).
  // -------------------------------------------------------------------
  it("B5: a refused passkey sign-in is captured as critical", async () => {
    arrive({ employmentStatus: "TERMINATED" });

    await webauthnFinish(request());

    const critical = capture.mock.calls
      .map((c) => c[1] as { scope: string; critical?: boolean })
      .find((ctx) => ctx.critical === true);
    expect(critical).toBeDefined();
    expect(critical!.scope).toContain("webauthn");
  });

  it("B4 (Am 3): an INVITED employee signing in by passkey is REFUSED and NOT activated", async () => {
    arrive({ essAccessStatus: "INVITED" });

    const res = await webauthnFinish(request());

    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
    for (const c of db.employee.update.mock.calls) {
      expect(c[0].data).not.toHaveProperty("essAccessStatus");
    }
  });

  it("B4c: an already-ACTIVE employee is not re-activated by a passkey sign-in", async () => {
    const res = await webauthnFinish(request());

    expect(res.status).toBe(200);
    for (const c of db.employee.update.mock.calls) {
      expect(c[0].data).not.toHaveProperty("essAccessStatus");
      expect(c[0].data).not.toHaveProperty("essActivatedAt");
    }
  });
});

// ---------------------------------------------------------------------------
// T6 — both paths must call the SAME implementation.
//
// The unit's whole point is that four checks copied into a second file would
// diverge again. A test that merely asserts both paths REFUSE a terminated
// employee passes just as well against two copies, so it proves nothing about
// the thing being fixed. This asserts the shared module is actually the one
// making the decision on BOTH paths, by replacing it and watching both routes
// change behaviour together.
// ---------------------------------------------------------------------------
describe("unit 0.14 — T6: both sign-in paths call the one shared gate", () => {
  it("T6: replacing evaluateEssAccess changes BOTH paths, proving neither has its own copy", async () => {
    vi.resetModules();

    const evaluateEssAccess = vi.fn(() => ({
      allowed: false as const,
      reason: "employment_ended" as const,
      status: 403,
      message: "Access denied — inactive employee",
    }));
    // One doubled module, consulted by both routes.
    vi.doMock("@/lib/ess-access-gate", () => ({
      evaluateEssAccess,
      ENDED_EMPLOYMENT_STATUSES: ["RESIGNED", "TERMINATED", "RETIRED"],
    }));

    const freshCreateSession = vi.fn(async () => "raw-token-abc");
    vi.doMock("@/lib/ess-auth", () => ({
      createEssSession: freshCreateSession,
      verifyEssPin: vi.fn(async () => true),
      verifyEssPassword: vi.fn(async () => true),
    }));

    const { POST: credentialPath } = await import("@/app/api/ess/auth/route");
    const { POST: passkeyPath } = await import(
      "@/app/api/ess/webauthn/authenticate/finish/route"
    );

    // Every underlying record is PERFECTLY healthy — ACTIVE employment, ACTIVE
    // ESS access, no deactivation. The only thing refusing is the shared gate.
    const healthy = {
      id: EMP,
      birthDate: new Date("1990-04-01T00:00:00.000Z"),
      essPin: null,
      deletedAt: null,
      employmentStatus: "ACTIVE",
      essAccessStatus: "ACTIVE",
      essDeactivateAt: null,
    };
    const freshDb = (await import("@/lib/prisma-admin")).default as unknown as {
      tenant: { findFirst: Fn };
      employee: { findFirst: Fn; update: Fn };
      essWebAuthnCredential: { findFirst: Fn; update: Fn };
      $queryRaw: Fn;
    };
    freshDb.tenant.findFirst.mockResolvedValue({ id: TENANT });
    freshDb.$queryRaw.mockResolvedValue([healthy]);
    freshDb.employee.findFirst.mockResolvedValue(healthy);
    freshDb.employee.update.mockResolvedValue({});
    freshDb.essWebAuthnCredential.findFirst.mockResolvedValue({
      credentialId: CRED_ID,
      publicKey: Buffer.from("pk").toString("base64url"),
      counter: 1n,
      employeeId: EMP,
      tenantId: TENANT,
    });
    freshDb.essWebAuthnCredential.update.mockResolvedValue({});

    const credRes = await credentialPath({
      json: async () => ({
        companyCode: "DEMOCORP",
        employeeNumber: "E001",
        pin: "480213",
      }),
    } as unknown as Parameters<typeof credentialPath>[0]);

    const passkeyRes = await passkeyPath(request());

    // Both refused, both by the SAME doubled function.
    expect(credRes.status).toBe(403);
    expect(passkeyRes.status).toBe(403);
    expect(evaluateEssAccess).toHaveBeenCalledTimes(2);
    // Neither path minted a session despite every record being healthy —
    // impossible if either still carried its own inline copy of the checks.
    expect(freshCreateSession).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/ess-access-gate");
    vi.doUnmock("@/lib/ess-auth");
    vi.resetModules();
  });
});
