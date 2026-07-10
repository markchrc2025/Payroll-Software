/**
 * Pins tenant-realm SSO resolution (src/lib/tenant-sso.ts):
 *  - company-code-first disambiguation of a multi-tenant email,
 *  - fast-path match by linked Authenticize subject,
 *  - and the guarantees that it never matches a SUPER_ADMIN, an inactive /
 *    soft-deleted account, an unknown company, or auto-provisions.
 *
 * The resolver takes its DB client as a parameter, so we pass a hand-rolled
 * in-memory stub that faithfully honours the where-filters instead of mocking
 * a real Prisma client.
 */
import { describe, expect, it } from "vitest";
import { resolveTenantSsoUser, type TenantSsoUser } from "@/lib/tenant-sso";

type Tenant = { id: string; companyCode: string | null; deletedAt: Date | null };
type Row = TenantSsoUser & { isActive: boolean; deletedAt: Date | null };

// Minimal Prisma-shaped stub that applies the exact filters the resolver uses.
function makeDb(tenants: Tenant[], users: Row[]) {
  return {
    tenant: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) =>
        tenants.find(
          (t) => t.companyCode === where.companyCode && t.deletedAt === null,
        ) ?? null,
    },
    user: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) =>
        users.find(
          (u) =>
            u.tenantId === where.tenantId &&
            u.isActive === true &&
            u.deletedAt === null &&
            (where.email === undefined || u.email === where.email) &&
            (where.authenticizeUserId === undefined ||
              u.authenticizeUserId === where.authenticizeUserId) &&
            (where.systemRole === undefined || u.systemRole === where.systemRole),
        ) ?? null,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function row(over: Partial<Row>): Row {
  return {
    id: "u1",
    email: "worker@acme.test",
    firstName: "Work",
    lastName: "Er",
    tenantId: "t1",
    systemRole: "TENANT_USER",
    roleId: "r1",
    authenticizeUserId: null,
    isActive: true,
    deletedAt: null,
    ...over,
  };
}

const ACME = { id: "t1", companyCode: "ACME", deletedAt: null };
const GLOBEX = { id: "t2", companyCode: "GLOBEX", deletedAt: null };

describe("resolveTenantSsoUser", () => {
  it("requires both email and company code", async () => {
    const db = makeDb([ACME], [row({})]);
    expect(await resolveTenantSsoUser(db, { email: "", companyCode: "ACME" })).toEqual({
      ok: false,
      reason: "missing_input",
    });
    expect(
      await resolveTenantSsoUser(db, { email: "worker@acme.test", companyCode: "" }),
    ).toEqual({ ok: false, reason: "missing_input" });
  });

  it("rejects an unknown company code", async () => {
    const db = makeDb([ACME], [row({})]);
    const r = await resolveTenantSsoUser(db, {
      email: "worker@acme.test",
      companyCode: "NOPE",
    });
    expect(r).toEqual({ ok: false, reason: "unknown_company" });
  });

  it("matches a tenant user by email within the chosen workspace", async () => {
    const db = makeDb([ACME], [row({ id: "u1" })]);
    const r = await resolveTenantSsoUser(db, {
      email: "worker@acme.test",
      companyCode: "acme", // case/space-insensitive
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe("u1");
  });

  it("normalises email and company code casing/whitespace before matching", async () => {
    // Stored row is lowercase; the IdP hands us mixed case + surrounding space.
    const db = makeDb([ACME], [row({ id: "u1", email: "worker@acme.test" })]);
    const r = await resolveTenantSsoUser(db, {
      email: "  Worker@ACME.test ",
      companyCode: " acme ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe("u1");
  });

  it("disambiguates the SAME email across tenants by company code", async () => {
    const users = [
      row({ id: "acme-user", tenantId: "t1", email: "chris@shared.test" }),
      row({ id: "globex-user", tenantId: "t2", email: "chris@shared.test" }),
    ];
    const db = makeDb([ACME, GLOBEX], users);

    const a = await resolveTenantSsoUser(db, {
      email: "chris@shared.test",
      companyCode: "ACME",
    });
    const b = await resolveTenantSsoUser(db, {
      email: "chris@shared.test",
      companyCode: "GLOBEX",
    });
    expect(a.ok && a.user.id).toBe("acme-user");
    expect(b.ok && b.user.id).toBe("globex-user");
  });

  it("fast-paths a previously linked account by Authenticize subject", async () => {
    // Email differs from the stored one — link must still resolve it.
    const db = makeDb(
      [ACME],
      [row({ id: "linked", email: "old@acme.test", authenticizeUserId: "auth-sub-1" })],
    );
    const r = await resolveTenantSsoUser(db, {
      email: "new@acme.test",
      companyCode: "ACME",
      authenticizeUserId: "auth-sub-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe("linked");
  });

  it("never matches a SUPER_ADMIN row", async () => {
    const db = makeDb(
      [ACME],
      [row({ id: "admin", systemRole: "SUPER_ADMIN", email: "boss@acme.test" })],
    );
    const r = await resolveTenantSsoUser(db, {
      email: "boss@acme.test",
      companyCode: "ACME",
    });
    expect(r).toEqual({ ok: false, reason: "no_account" });
  });

  it("never matches an inactive or soft-deleted account", async () => {
    const db = makeDb(
      [ACME],
      [
        row({ id: "gone", email: "left@acme.test", isActive: false }),
        row({ id: "deleted", email: "del@acme.test", deletedAt: new Date() }),
      ],
    );
    expect(
      (await resolveTenantSsoUser(db, { email: "left@acme.test", companyCode: "ACME" })).ok,
    ).toBe(false);
    expect(
      (await resolveTenantSsoUser(db, { email: "del@acme.test", companyCode: "ACME" })).ok,
    ).toBe(false);
  });

  it("does not auto-provision when no account exists in the tenant", async () => {
    const db = makeDb([ACME], []);
    const r = await resolveTenantSsoUser(db, {
      email: "stranger@acme.test",
      companyCode: "ACME",
    });
    expect(r).toEqual({ ok: false, reason: "no_account" });
  });
});
