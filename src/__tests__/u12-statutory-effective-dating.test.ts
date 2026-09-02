/**
 * Unit 1.2 — statutory rates are selected by the PAYROLL PERIOD, not by today.
 *
 * The property under test is the one that makes a recomputed payslip match the
 * one originally issued: re-running a 2025 period in 2026 must use the 2025
 * rates, even though a newer rule exists. Without it, re-running any historical
 * payroll silently restates figures that were correct when issued.
 *
 * This runs against a REAL PostgreSQL, deliberately. `getActiveRule` is a query —
 * its whole behaviour is the WHERE clause — so a mocked client would only test my
 * model of Prisma's filtering rather than Prisma's filtering. Set
 * TEST_DATABASE_URL to a database with migrations applied; the suite skips
 * cleanly when it is absent so CI without a database stays green.
 *
 *   docker run -d -e POSTGRES_PASSWORD=pw -e POSTGRES_USER=owner \
 *     -e POSTGRES_DB=t -p 55460:5432 postgres:18
 *   DIRECT_DATABASE_URL=postgresql://owner:pw@127.0.0.1:55460/t npx prisma migrate deploy
 *   TEST_DATABASE_URL=postgresql://owner:pw@127.0.0.1:55460/t npx vitest run
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getActiveRule, StatutoryRuleNotFoundError } from "@/lib/statutory/resolver";
import { computePhilHealth } from "@/lib/statutory/compute";
import type { PhilHealthSchedulePayload } from "@/lib/statutory/types";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

/** ₱20,000.00 monthly compensation, in centavos. */
const GROSS = 2_000_000n;

/** 2025 rule: 5% premium. */
const PHIC_V1: PhilHealthSchedulePayload = {
  rate: 0.05,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};

/** 2026 rule: 6% premium — deliberately far from v1 so a wrong pick cannot coincide. */
const PHIC_V2: PhilHealthSchedulePayload = {
  rate: 0.06,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};

/** Tenant override for the 2025 window: 4%. */
const PHIC_TENANT_2025: PhilHealthSchedulePayload = {
  rate: 0.04,
  split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 },
  premium: { min: 50_000, max: 500_000 },
};

const CATEGORY = "PHILHEALTH_SCHEDULE" as const;
const TENANT_ID = "u12tenant000000000000000";
const OTHER_TENANT = "u12other0000000000000000";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let prisma: PrismaClient;
const createdRuleIds: string[] = [];

describeDb("unit 1.2 — statutory rules resolve by payroll period (T1)", () => {
  beforeAll(async () => {
    // Constructed exactly as src/lib/prisma-admin.ts does — this project uses the
    // pg driver adapter, so `datasourceUrl` is not accepted.
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB }) });

    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT] } } });
    await prisma.statutoryRule.deleteMany({
      where: { category: CATEGORY, version: { startsWith: "U12-" } },
    });

    for (const id of [TENANT_ID, OTHER_TENANT]) {
      await prisma.tenant.create({
        data: { id, name: `u12 ${id}`, companyCode: id.slice(0, 8).toUpperCase() },
      });
    }

    const mk = async (
      version: string,
      from: string,
      to: string | null,
      payload: PhilHealthSchedulePayload,
      tenantId: string | null,
    ) => {
      const row = await prisma.statutoryRule.create({
        data: {
          tenantId,
          category: CATEGORY,
          version,
          effectiveFrom: d(from),
          effectiveTo: to ? d(to) : null,
          legalBasis: `unit 1.2 fixture ${version}`,
          payload: payload as unknown as object,
        },
        select: { id: true },
      });
      createdRuleIds.push(row.id);
    };

    // Global v1 covers 2025; global v2 takes over from 2026-01-01, open-ended.
    await mk("U12-PHIC-2025-v1", "2025-01-01", "2026-01-01", PHIC_V1, null);
    await mk("U12-PHIC-2026-v2", "2026-01-01", null, PHIC_V2, null);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.statutoryRule.deleteMany({ where: { id: { in: createdRuleIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT] } } });
    await prisma.$disconnect();
  });

  // -- the vacuity guard ----------------------------------------------------
  it("T1.0: the two versions produce DIFFERENT figures, so the comparisons mean something", () => {
    const a = computePhilHealth(PHIC_V1, GROSS).employee;
    const b = computePhilHealth(PHIC_V2, GROSS).employee;
    expect(a).not.toBe(b);
    // 20,000 × 5% ÷ 2 = ₱500.00 ; 20,000 × 6% ÷ 2 = ₱600.00
    expect(a).toBe(50_000n);
    expect(b).toBe(60_000n);
  });

  // -- the core property ----------------------------------------------------
  it("T1.1: a 2025 period resolves the 2025 rule and computes ₱500.00", async () => {
    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2025-06-30"));
    expect(rule.version).toBe("U12-PHIC-2025-v1");
    expect(computePhilHealth(rule.payload, GROSS).employee).toBe(50_000n);
  });

  it("T1.2: a 2026 period resolves the 2026 rule and computes ₱600.00", async () => {
    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2026-06-30"));
    expect(rule.version).toBe("U12-PHIC-2026-v2");
    expect(computePhilHealth(rule.payload, GROSS).employee).toBe(60_000n);
  });

  it("T1.3: RE-RUNNING the 2025 period while v2 exists still yields the 2025 figure", async () => {
    // This is the sealed-record property. Both rules are already in the table —
    // the 2026 rule was published above, before this assertion runs.
    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2025-06-30"));
    expect(rule.version).toBe("U12-PHIC-2025-v1");
    expect(computePhilHealth(rule.payload, GROSS).employee).toBe(50_000n);
  });

  // -- the boundary ---------------------------------------------------------
  it("T1.4: exactly 2026-01-01 picks v2 (effectiveFrom inclusive, effectiveTo exclusive)", async () => {
    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2026-01-01"));
    expect(rule.version).toBe("U12-PHIC-2026-v2");
  });

  it("T1.5: the day before the boundary still picks v1", async () => {
    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2025-12-31"));
    expect(rule.version).toBe("U12-PHIC-2025-v1");
  });

  // -- tenant precedence is period-scoped too --------------------------------
  it("T1.6: a tenant override for the 2025 window beats global v1", async () => {
    const row = await prisma.statutoryRule.create({
      data: {
        tenantId: TENANT_ID,
        category: CATEGORY,
        version: "U12-PHIC-2025-tenant",
        effectiveFrom: d("2025-01-01"),
        effectiveTo: d("2026-01-01"),
        legalBasis: "unit 1.2 fixture tenant override",
        payload: PHIC_TENANT_2025 as unknown as object,
      },
      select: { id: true },
    });
    createdRuleIds.push(row.id);

    const rule = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2025-06-30"));
    expect(rule.version).toBe("U12-PHIC-2025-tenant");
    // 20,000 × 4% ÷ 2 = ₱400.00
    expect(computePhilHealth(rule.payload, GROSS).employee).toBe(40_000n);

    // …and it does NOT leak into the 2026 period, whose window it does not cover.
    const later = await getActiveRule(prisma, TENANT_ID, CATEGORY, d("2026-06-30"));
    expect(later.version).toBe("U12-PHIC-2026-v2");

    // …nor to a different tenant, which still sees the global rule.
    const other = await getActiveRule(prisma, OTHER_TENANT, CATEGORY, d("2025-06-30"));
    expect(other.version).toBe("U12-PHIC-2025-v1");
  });

  // -- no silent fallback ---------------------------------------------------
  it("T1.7: a period before any rule exists THROWS rather than falling back", async () => {
    await expect(
      getActiveRule(prisma, TENANT_ID, CATEGORY, d("2024-06-30")),
    ).rejects.toBeInstanceOf(StatutoryRuleNotFoundError);
  });
});
