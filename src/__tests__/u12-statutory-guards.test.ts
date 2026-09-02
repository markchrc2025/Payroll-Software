/**
 * Unit 1.2 — the two back doors that can destroy statutory history (T2, T4).
 *
 * Effective-dating already worked; what did not was preventing the history it
 * depends on from being deleted or silently rewritten. These cover:
 *
 *   T2 — DELETE is refused for a rule whose window overlaps a payroll period,
 *        and still permitted for one that never priced anything.
 *   T4 — MINIMUM_WAGE_RATE / DE_MINIMIS_CEILING now fail LOUDLY instead of being
 *        try/catch'd into null.
 *
 * T2 runs against a REAL PostgreSQL when TEST_DATABASE_URL is set (the guard is a
 * query, so mocking it would test the mock), and skips cleanly otherwise.
 */
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// `_shared.ts` is a route module, so importing it pulls in the super-admin auth
// chain and, through it, the NextAuth runtime — which reaches for `next/server`
// and cannot resolve under vitest's node environment. Stubbing the auth edge
// keeps the module importable; `findConflictingBook` itself is the real one.
vi.mock("@/lib/super-admin-auth", () => ({ getSuperAdminContext: async () => null }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: async () => {}, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/prisma-admin", () => ({ default: {} }));

import { findConflictingBook, type BookClient } from "@/app/api/admin/statutory/_shared";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TENANT = "u12guard000000000000000a";

let prisma: PrismaClient;
const bookIds: string[] = [];

describeDb("unit 1.2 — DELETE is refused once a rule has priced a period (T2)", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB }) });
    await prisma.payrollBook.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.tenant.create({
      data: { id: TENANT, name: "u12 guard tenant", companyCode: "U12GUARD" },
    });

    const mkBook = async (from: string, to: string, status: "DRAFT" | "FINALIZED" | "CANCELLED") => {
      const b = await prisma.payrollBook.create({
        data: {
          tenantId: TENANT,
          periodStart: d(from),
          periodEnd: d(to),
          cycle: "SEMI_MONTHLY",
          status,
        },
        select: { id: true },
      });
      bookIds.push(b.id);
      return b.id;
    };

    await mkBook("2025-06-01", "2025-06-15", "FINALIZED");
    await mkBook("2027-01-01", "2027-01-15", "CANCELLED");
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.payrollBook.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it("T2.1: a global rule covering a computed period IS blocked", async () => {
    const conflict = await findConflictingBook(
      { tenantId: null, effectiveFrom: d("2025-01-01"), effectiveTo: d("2026-01-01") },
      prisma as unknown as BookClient,
    );
    expect(conflict).not.toBeNull();
    expect(conflict!.periodEnd.toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("T2.2: a rule whose window never touched a period is NOT blocked", async () => {
    const conflict = await findConflictingBook(
      { tenantId: null, effectiveFrom: d("2020-01-01"), effectiveTo: d("2021-01-01") },
      prisma as unknown as BookClient,
    );
    expect(conflict).toBeNull();
  });

  it("T2.3: an open-ended rule starting after every period is NOT blocked", async () => {
    const conflict = await findConflictingBook(
      { tenantId: null, effectiveFrom: d("2030-01-01"), effectiveTo: null },
      prisma as unknown as BookClient,
    );
    expect(conflict).toBeNull();
  });

  it("T2.4: a CANCELLED book never priced anything, so it does not block", async () => {
    // 2027 has only the CANCELLED book.
    const conflict = await findConflictingBook(
      { tenantId: null, effectiveFrom: d("2027-01-01"), effectiveTo: d("2027-12-31") },
      prisma as unknown as BookClient,
    );
    expect(conflict).toBeNull();
  });

  it("T2.5: an open-ended rule starting before a period IS blocked", async () => {
    const conflict = await findConflictingBook(
      { tenantId: null, effectiveFrom: d("2025-01-01"), effectiveTo: null },
      prisma as unknown as BookClient,
    );
    expect(conflict).not.toBeNull();
  });

  it("T2.6: a TENANT-scoped rule only considers that tenant's books", async () => {
    const mine = await findConflictingBook(
      { tenantId: TENANT, effectiveFrom: d("2025-01-01"), effectiveTo: d("2026-01-01") },
      prisma as unknown as BookClient,
    );
    expect(mine).not.toBeNull();

    const other = await findConflictingBook(
      { tenantId: "u12someoneelse0000000000", effectiveFrom: d("2025-01-01"), effectiveTo: d("2026-01-01") },
      prisma as unknown as BookClient,
    );
    expect(other).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T4 — the optional-category swallow is gone
// ---------------------------------------------------------------------------

describe("unit 1.2 — every statutory category now fails loudly (T4)", () => {
  it("T4: a missing MINIMUM_WAGE_RATE rejects instead of yielding null", async () => {
    vi.resetModules();

    // Cache passthrough so the resolver body actually runs.
    vi.doMock("@/lib/cache", () => ({
      getOrSet: async (_k: unknown, _t: unknown, fn: () => Promise<unknown>) => fn(),
      CacheKeys: { statutory: () => "k" },
      TTL: { STATUTORY: 1 },
    }));

    const seen: string[] = [];
    vi.doMock("@/lib/statutory/resolver", () => ({
      getActiveRule: async (_c: unknown, _t: string, category: string) => {
        seen.push(category);
        if (category === "MINIMUM_WAGE_RATE") {
          throw new Error("No active StatutoryRule for category=MINIMUM_WAGE_RATE");
        }
        return { payload: {} };
      },
    }));

    const { resolveAllRules } = await import("@/lib/payroll/persist");

    await expect(
      resolveAllRules({} as never, "t1", new Date("2026-06-30")),
    ).rejects.toThrow(/MINIMUM_WAGE_RATE/);

    // …and it was actually requested, rather than skipped.
    expect(seen).toContain("MINIMUM_WAGE_RATE");
    expect(seen).toContain("DE_MINIMIS_CEILING");
  });

  it("T4b: a missing DE_MINIMIS_CEILING also rejects", async () => {
    vi.resetModules();
    vi.doMock("@/lib/cache", () => ({
      getOrSet: async (_k: unknown, _t: unknown, fn: () => Promise<unknown>) => fn(),
      CacheKeys: { statutory: () => "k" },
      TTL: { STATUTORY: 1 },
    }));
    vi.doMock("@/lib/statutory/resolver", () => ({
      getActiveRule: async (_c: unknown, _t: string, category: string) => {
        if (category === "DE_MINIMIS_CEILING") {
          throw new Error("No active StatutoryRule for category=DE_MINIMIS_CEILING");
        }
        return { payload: {} };
      },
    }));

    const { resolveAllRules } = await import("@/lib/payroll/persist");
    await expect(
      resolveAllRules({} as never, "t1", new Date("2026-06-30")),
    ).rejects.toThrow(/DE_MINIMIS_CEILING/);
  });

  it("T4c: with all six present it resolves and carries both formerly-optional payloads", async () => {
    vi.resetModules();
    vi.doMock("@/lib/cache", () => ({
      getOrSet: async (_k: unknown, _t: unknown, fn: () => Promise<unknown>) => fn(),
      CacheKeys: { statutory: () => "k" },
      TTL: { STATUTORY: 1 },
    }));
    vi.doMock("@/lib/statutory/resolver", () => ({
      getActiveRule: async (_c: unknown, _t: string, category: string) => ({
        payload: { tag: category },
      }),
    }));

    const { resolveAllRules } = await import("@/lib/payroll/persist");
    const rules = await resolveAllRules({} as never, "t1", new Date("2026-06-30"));

    expect((rules.minWage as unknown as { tag: string }).tag).toBe("MINIMUM_WAGE_RATE");
    expect((rules.deMinimis as unknown as { tag: string }).tag).toBe("DE_MINIMIS_CEILING");
  });
});
