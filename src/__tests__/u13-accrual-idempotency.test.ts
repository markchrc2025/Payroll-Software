/**
 * Unit 0.13 — the accrual must grant a period exactly once (T1, T4, T6, T7).
 *
 * The pre-0.13 handler iterated every active leave type × every non-resigned
 * employee and added `accrualAmount` to the running balance on EVERY run. With a
 * daily cron that is ~30 grants a month. These tests run the accrual twice for
 * the same entitlement and period and assert the balance moved exactly once.
 *
 * Idempotency is asserted through a mock that simulates Postgres's unique
 * violation (P2002) on (entitlementId, type, periodKey) — the same constraint
 * the migration creates. That is deliberate: it proves the handler relies on the
 * ATOMIC constraint rather than on a read-then-write check, which is what makes
 * it safe under pg-boss retries and concurrent runs. The constraint itself is
 * additionally verified against a real PostgreSQL 18 instance outside the suite.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Decimal from "decimal.js";

import { utcDay } from "@/lib/leave/accrual-math";

// ---------------------------------------------------------------------------
// In-memory stand-in for prismaAdmin
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted above module scope, so the store and the mock
// must be created inside vi.hoisted() to exist by the time the factory runs.
const { db, prismaAdminMock } = vi.hoisted(() => {
  const db = {
    tenants: [] as Record<string, unknown>[],
    leaveTypes: [] as Record<string, unknown>[],
    employees: [] as Record<string, unknown>[],
    entitlements: [] as Record<string, unknown>[],
    balances: [] as Record<string, unknown>[],
    transactions: [] as Record<string, unknown>[],
  };

  const matches = (row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => {
      if (v === null) return row[k] === null || row[k] === undefined;
      if (typeof v === "object" && v !== null) {
        const cond = v as Record<string, unknown>;
        if ("notIn" in cond) return !(cond.notIn as unknown[]).includes(row[k]);
        if ("in" in cond) return (cond.in as unknown[]).includes(row[k]);
        if ("not" in cond) return row[k] !== cond.not;
        return true;
      }
      return row[k] === v;
    });
  };

  class UniqueViolation extends Error {
    code = "P2002";
    constructor() {
      super("Unique constraint failed on the fields: (`entitlementId`,`type`,`periodKey`)");
    }
  }

  const Dec = (v: unknown) => v;

  const prismaAdminMock = {
    tenant: { findMany: async (a?: { where?: Record<string, unknown> }) => db.tenants.filter((r) => matches(r, a?.where)) },
    leaveType: { findMany: async (a?: { where?: Record<string, unknown> }) => db.leaveTypes.filter((r) => matches(r, a?.where)) },
    employee: { findMany: async (a?: { where?: Record<string, unknown> }) => db.employees.filter((r) => matches(r, a?.where)) },
    leaveEntitlement: {
      findMany: async (a?: { where?: Record<string, unknown> }) => db.entitlements.filter((r) => matches(r, a?.where)),
    },
    leaveBalance: {
      findUnique: async (a: { where: Record<string, unknown> }) => {
        const k = a.where.employeeId_leaveTypeId_year as Record<string, unknown> | undefined;
        if (!k) return null;
        return (
          db.balances.find(
            (b) => b.employeeId === k.employeeId && b.leaveTypeId === k.leaveTypeId && b.year === k.year,
          ) ?? null
        );
      },
      create: async (a: { data: Record<string, unknown> }) => {
        const row = { id: `bal${db.balances.length + 1}`, earned: Dec(0), openingBalance: Dec(0), ...a.data };
        db.balances.push(row);
        return row;
      },
      update: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const k = a.where.employeeId_leaveTypeId_year as Record<string, unknown>;
        const row = db.balances.find(
          (b) => b.employeeId === k.employeeId && b.leaveTypeId === k.leaveTypeId && b.year === k.year,
        );
        if (!row) throw new Error("balance not found");
        Object.assign(row, a.data);
        return row;
      },
    },
    leaveTransaction: {
      create: async (a: { data: Record<string, unknown> }) => {
        const d = a.data;
        if (d.periodKey != null) {
          const clash = db.transactions.some(
            (t) => t.entitlementId === d.entitlementId && t.type === d.type && t.periodKey === d.periodKey,
          );
          if (clash) throw new UniqueViolation();
        }
        const row = { id: `tx${db.transactions.length + 1}`, ...d };
        db.transactions.push(row);
        return row;
      },
    },
  };

  return { db, prismaAdminMock };
});

vi.mock("@/lib/prisma-admin", () => ({ default: prismaAdminMock }));

import { handleLeaveAccrual } from "@/lib/jobs/handlers/leave-accrual";

// ---------------------------------------------------------------------------

const RATE = new Decimal("1.25");

function seed(overrides?: { proRate?: boolean; frequency?: string; amount?: Decimal; timezone?: string }) {
  db.tenants.length = 0;
  db.leaveTypes.length = 0;
  db.employees.length = 0;
  db.entitlements.length = 0;
  db.balances.length = 0;
  db.transactions.length = 0;

  db.tenants.push({ id: "t1", deletedAt: null, timezone: overrides?.timezone ?? "Asia/Manila" });
  db.leaveTypes.push({
    id: "lt1",
    tenantId: "t1",
    isActive: true,
    deletedAt: null,
    unit: "DAYS",
    accrualFrequency: overrides?.frequency ?? "MONTHLY",
    accrualAmount: overrides?.amount ?? RATE,
    maxAccruableBalance: null,
  });
  db.employees.push({
    id: "e1",
    tenantId: "t1",
    deletedAt: null,
    employmentStatus: "REGULAR",
    regularizationDate: utcDay(2026, 1, 1),
    resignationDate: null,
    lastWorkingDate: null,
  });
  db.entitlements.push({
    id: "ent1",
    tenantId: "t1",
    employeeId: "e1",
    leaveTypeId: "lt1",
    startDate: utcDay(2026, 2, 14),
    endDate: utcDay(2026, 12, 31),
    proRate: overrides?.proRate ?? false,
    accrualAmount: overrides?.amount ?? RATE,
    accrualFrequency: overrides?.frequency ?? "MONTHLY",
    deletedAt: null,
  });
}

function earnedOf(): string {
  const b = db.balances[0];
  return b ? new Decimal(b.earned as Decimal.Value).toString() : "(no balance row)";
}

beforeEach(() => {
  vi.useFakeTimers();
  // 3 March 2026 → the most recently COMPLETED monthly period is February 2026.
  vi.setSystemTime(new Date("2026-03-03T10:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("unit 0.13 — an accrual period is granted exactly once (T1)", () => {
  it("T1: running the accrual twice grants February exactly once", async () => {
    await handleLeaveAccrual();
    const afterFirst = earnedOf();

    await handleLeaveAccrual();
    const afterSecond = earnedOf();

    expect(afterFirst).toBe("1.25");
    expect(afterSecond).toBe("1.25"); // NOT 2.50
  });

  it("T1b: a third and fourth run still grant nothing further", async () => {
    await handleLeaveAccrual();
    await handleLeaveAccrual();
    await handleLeaveAccrual();
    await handleLeaveAccrual();
    expect(earnedOf()).toBe("1.25");
  });

  it("T1c: exactly one ACCRUAL transaction is written for the period", async () => {
    await handleLeaveAccrual();
    await handleLeaveAccrual();
    const accruals = db.transactions.filter((t) => t.type === "ACCRUAL");
    expect(accruals).toHaveLength(1);
    expect(accruals[0].periodKey).toBe("2026-02");
    expect(accruals[0].entitlementId).toBe("ent1");
  });

  it("T1d: pro-rated first period is granted once, at the rounded value", async () => {
    seed({ proRate: true });
    await handleLeaveAccrual();
    await handleLeaveAccrual();
    // 15/28 × 1.25 = 0.6696 → 0.75
    expect(earnedOf()).toBe("0.75");
  });
});

describe("unit 0.13 — LUMP_SUM (T4)", () => {
  it("T4: grants to openingBalance, never to earned", async () => {
    seed({ frequency: "LUMP_SUM", amount: new Decimal("15") });
    await handleLeaveAccrual();

    const b = db.balances[0];
    expect(b).toBeDefined();
    expect(new Decimal(b.openingBalance as Decimal.Value).toString()).toBe("15");
    expect(new Decimal(b.earned as Decimal.Value).toString()).toBe("0");
  });

  it("T4b: a second run grants nothing more", async () => {
    seed({ frequency: "LUMP_SUM", amount: new Decimal("15") });
    await handleLeaveAccrual();
    await handleLeaveAccrual();

    expect(new Decimal(db.balances[0].openingBalance as Decimal.Value).toString()).toBe("15");
    expect(db.transactions.filter((t) => t.type === "ACCRUAL")).toHaveLength(1);
  });

  it("T4c: the lump sum is keyed once per ENTITLEMENT, not per period", async () => {
    seed({ frequency: "LUMP_SUM", amount: new Decimal("15") });
    await handleLeaveAccrual();
    expect(db.transactions[0].periodKey).toBe("LUMP");
  });
});

describe("unit 0.13 — tenant timezone drives period boundaries (T6)", () => {
  it("T6: a tenant west of UTC has not yet completed February at the same instant", async () => {
    // 1 March 2026 00:30 UTC. In Asia/Manila that is already 1 March (08:30) so
    // February is complete. In America/New_York it is still 28 February 19:30,
    // so February is NOT complete and nothing may be granted yet.
    vi.setSystemTime(new Date("2026-03-01T00:30:00Z"));

    seed({ timezone: "America/New_York" });
    await handleLeaveAccrual();
    const western = db.transactions.filter((t) => t.type === "ACCRUAL").length;

    seed({ timezone: "Asia/Manila" });
    await handleLeaveAccrual();
    const eastern = db.transactions.filter((t) => t.type === "ACCRUAL").length;

    expect(western).toBe(0);
    expect(eastern).toBe(1);
  });

  it("T6b: the tenant timezone is used, not a hardcoded UTC+8", async () => {
    vi.setSystemTime(new Date("2026-03-01T00:30:00Z"));
    seed({ timezone: "UTC" });
    await handleLeaveAccrual();
    // In UTC it is already 1 March, so February is complete.
    expect(db.transactions.filter((t) => t.type === "ACCRUAL")).toHaveLength(1);
  });
});

describe("unit 0.13 — zero entitlements (T7)", () => {
  it("T7: completes cleanly and grants nothing when no entitlement exists", async () => {
    seed();
    db.entitlements.length = 0;

    await expect(handleLeaveAccrual()).resolves.toBeUndefined();

    expect(db.balances).toHaveLength(0);
    expect(db.transactions).toHaveLength(0);
  });

  it("T7b: completes cleanly when there are no tenants at all", async () => {
    seed();
    db.tenants.length = 0;
    db.entitlements.length = 0;
    await expect(handleLeaveAccrual()).resolves.toBeUndefined();
  });

  it("T7c: a soft-deleted entitlement is ignored", async () => {
    seed();
    db.entitlements[0].deletedAt = new Date();
    await handleLeaveAccrual();
    expect(db.transactions).toHaveLength(0);
  });
});
