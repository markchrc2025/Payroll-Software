/**
 * GET /api/ess/leave-balances
 *
 * Returns the authenticated employee's leave balances for the current year.
 *
 * Query params:
 *   year — defaults to current year
 *
 * Response: { data: LeaveBalance[] }
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getEssContext } from "@/lib/ess-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getOrSet } from "@/lib/cache/cache";
import { CacheKeys, TTL } from "@/lib/cache/keys";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  try {
    const balances = await getOrSet(
      CacheKeys.leaveBalance(ctx.tenantId, ctx.employeeId, year),
      TTL.LEAVE_BALANCE,
      () =>
        withTenant(ctx.tenantId, (tx) =>
          tx.leaveBalance.findMany({
            where: {
              tenantId: ctx.tenantId,
              employeeId: ctx.employeeId,
              year,
            },
            include: { leaveType: { select: { name: true, code: true, isPaid: true, unit: true } } },
            orderBy: { leaveType: { name: "asc" } },
          }),
        ),
    );

    // PAY-184: the leave forms list the types from this response. An active
    // leave type the employee has no balance for yet (a new hire, a type HR
    // just added) must still be offered: POST /api/ess/leaves creates the
    // balance and files what the balance cannot cover as leave without pay.
    // Such types come back as a zero balance with id "new-<leaveTypeId>".
    const activeTypes = await withTenant(ctx.tenantId, (tx) =>
      tx.leaveType.findMany({
        where: { tenantId: ctx.tenantId, isActive: true, deletedAt: null },
        select: { id: true, name: true, code: true, isPaid: true, unit: true },
        orderBy: { name: "asc" },
      }),
    );
    const have = new Set(balances.map((b) => b.leaveTypeId));
    const zero = new Prisma.Decimal(0);
    const placeholders = activeTypes
      .filter((t) => !have.has(t.id))
      .map((t) => ({
        id: `new-${t.id}`,
        tenantId: ctx.tenantId,
        employeeId: ctx.employeeId,
        leaveTypeId: t.id,
        year,
        openingBalance: zero,
        earned: zero,
        used: zero,
        forfeited: zero,
        convertedToCash: zero,
        leaveType: { name: t.name, code: t.code, isPaid: t.isPaid, unit: t.unit },
      }));

    const serialized = [...balances, ...placeholders].map((b) => ({
      ...b,
      openingBalance: b.openingBalance.toString(),
      earned: b.earned.toString(),
      used: b.used.toString(),
      forfeited: b.forfeited.toString(),
      convertedToCash: b.convertedToCash.toString(),
    }));

    return ok(serialized);
  } catch (e) {
    console.error("[ess/leave-balances]", e);
    return serverError(e);
  }
}
