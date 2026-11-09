/**
 * Unit 0.15: ESS reset-password, reviewed (R46 downgraded it from a fix).
 *
 * R46/R51: the mixed write (new hash plus INVITED to ACTIVE) is atomic, so the
 * 0.10 failure cannot happen here. The review kept that and found three gaps
 * the earlier reading missed:
 *
 *   R1  the token was checked, then consumed by id without re-checking usedAt,
 *       so two requests racing with one link could both set a password. It is
 *       now claimed with `usedAt: null` in the WHERE, first, and the loser
 *       writes nothing.
 *   R2  open ESS sessions survived a reset. A reset is what someone does when
 *       they think the account is compromised. All are revoked now.
 *   R3  other unused reset links stayed valid. They are retired now.
 *   R4  kept: a reset on an INVITED account activates it (same proof as the
 *       activation link: control of the work email).
 *   R5  kept: separated employees are refused before anything is written.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

type Call = { op: string; args: { where?: Record<string, unknown>; data?: Record<string, unknown> } };
let calls: Call[] = [];
let claimCount = 1;

const rec = (op: string) => async (args: Call["args"]) => {
  calls.push({ op, args });
  if (op === "essPasswordReset.updateMany" && args.where && "id" in args.where) return { count: claimCount };
  return { count: 0 };
};
const tx = {
  essPasswordReset: { updateMany: rec("essPasswordReset.updateMany") },
  employee: { update: rec("employee.update") },
  essSession: { updateMany: rec("essSession.updateMany") },
};

vi.mock("@/lib/prisma-admin", () => ({
  default: {
    essPasswordReset: { findUnique: vi.fn() },
    employee: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/ess-auth", () => ({
  hashEssToken: (t: string) => `h:${t}`,
  hashEssPassword: async (p: string) => `bcrypt:${p}`,
}));
vi.mock("@/lib/emails", () => ({ sendEmployeeResetPasswordNotice: vi.fn(async () => {}) }));
vi.mock("@/lib/security-context", () => ({ securityContext: () => ({ device: "test", changedAt: "now" }) }));

import prismaAdmin from "@/lib/prisma-admin";
import { POST } from "@/app/api/ess/reset-password/route";

type Fn = ReturnType<typeof vi.fn>;
const db = prismaAdmin as unknown as {
  essPasswordReset: { findUnique: Fn };
  employee: { findFirst: Fn };
  $transaction: Fn;
};

const future = new Date(Date.now() + 3600_000);
const req = () =>
  new Request("http://test.local/api/ess/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: "tok15", password: "a-strong-pass" }),
  }) as never;

function arrange(emp: Record<string, unknown> = {}) {
  db.essPasswordReset.findUnique.mockResolvedValue({ id: "rst15", employeeId: "emp15", usedAt: null, expiresAt: future });
  db.employee.findFirst.mockResolvedValue({
    id: "emp15",
    workEmail: "e@x.test",
    employmentStatus: "REGULAR",
    essAccessStatus: "ACTIVE",
    ...emp,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  calls = [];
  claimCount = 1;
});

describe("unit 0.15: ESS reset-password", () => {
  it("R1 claims the token with usedAt: null FIRST, before writing the password", async () => {
    arrange();
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(calls[0]).toEqual({
      op: "essPasswordReset.updateMany",
      args: { where: { id: "rst15", usedAt: null }, data: { usedAt: expect.any(Date) } },
    });
    expect(calls.map((c) => c.op).indexOf("employee.update")).toBeGreaterThan(0);
  });

  it("R1b a link already consumed by a racing request writes nothing and is refused", async () => {
    arrange();
    claimCount = 0;
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(calls.map((c) => c.op)).toEqual(["essPasswordReset.updateMany"]);
  });

  it("R2 revokes every open ESS session for the employee", async () => {
    arrange();
    await POST(req());
    const revoke = calls.find((c) => c.op === "essSession.updateMany");
    expect(revoke?.args).toEqual({ where: { employeeId: "emp15", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("R3 retires the employee's other unused reset links", async () => {
    arrange();
    await POST(req());
    const retire = calls.filter((c) => c.op === "essPasswordReset.updateMany")[1];
    expect(retire?.args.where).toEqual({ employeeId: "emp15", usedAt: null });
  });

  it("R4 an INVITED account is activated by the reset", async () => {
    arrange({ essAccessStatus: "INVITED" });
    await POST(req());
    const upd = calls.find((c) => c.op === "employee.update")!;
    expect(upd.args.data).toMatchObject({ essPasswordHash: "bcrypt:a-strong-pass", essAccessStatus: "ACTIVE" });
  });

  it("R5 a separated employee is refused before anything is written", async () => {
    arrange({ employmentStatus: "TERMINATED" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
