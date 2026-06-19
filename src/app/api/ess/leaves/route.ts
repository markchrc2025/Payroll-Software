/**
 * GET  /api/ess/leaves       — list own leave transactions (USAGE type only)
 * POST /api/ess/leaves       — file a new leave request
 *
 * GET query params:
 *   page   — default 1
 *   limit  — default 10, max 50
 *   status — filter by approvalStatus (PENDING | APPROVED | REJECTED | CANCELLED)
 *
 * POST body:
 *   { leaveTypeId, startDate, endDate, amount, reason? }
 *
 * Filing rules:
 *   • The employee must have an active LeaveBalance for the leave type in the
 *     current year.
 *   • `amount` cannot exceed (balance.earned - balance.used - balance.forfeited).
 *   • Transaction is created with status PENDING — approval is done by HR in the
 *     admin portal.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import {
  err,
  ok,
  paginated,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";
import { splitLeaveUnits, resolveOrCreateBalance } from "@/lib/leave/filing";

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "10")));
  const status = searchParams.get("status") ?? undefined;
  const skip = (page - 1) * limit;

  try {
    const [txns, total] = await withTenant(ctx.tenantId, async (tx) =>
      Promise.all([
        tx.leaveTransaction.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            type: "USAGE",
            ...(status ? { approvalStatus: status as never } : {}),
          },
          include: { leaveType: { select: { name: true, code: true, unit: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        tx.leaveTransaction.count({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            type: "USAGE",
            ...(status ? { approvalStatus: status as never } : {}),
          },
        }),
      ]),
    );

    return paginated(txns.map(serializeLeaveTransaction), total, page, limit);
  } catch (e) {
    console.error("[ess/leaves GET]", e);
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
const FiledLeaveSchema = z.object({
  leaveTypeId: z.string().cuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Number of days (or hours if unit=HOURS). */
  amount: z.number().positive().max(365),
  dayPortion: z.enum(["FULL", "HALF_AM", "HALF_PM"]).default("FULL"),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = FiledLeaveSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { leaveTypeId, startDate, endDate, amount, dayPortion, reason } = parsed.data;

  if (endDate < startDate) {
    return err("endDate must be on or after startDate", 400);
  }
  if (dayPortion !== "FULL" && endDate !== startDate) {
    return err("Half-day leave must be a single date", 422);
  }

  const year = new Date(startDate).getFullYear();

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Verify leave type belongs to tenant
      const leaveType = await tx.leaveType.findFirst({
        where: { id: leaveTypeId, tenantId: ctx.tenantId, isActive: true, deletedAt: null },
      });
      if (!leaveType) return "leave_type_not_found" as const;

      // Resolve (or create) the balance and split paid vs LWOP. Insufficient
      // entitlement is filed as Leave-Without-Pay rather than rejected.
      const balance = await resolveOrCreateBalance(tx, ctx.tenantId, ctx.employeeId, leaveTypeId, year);
      const { paidUnits, unpaidUnits } = leaveType.isPaid
        ? splitLeaveUnits(balance.available, amount)
        : { paidUnits: 0, unpaidUnits: amount };

      const txn = await tx.leaveTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          leaveTypeId,
          leaveBalanceId: balance.id,
          type: "USAGE",
          amount,
          dayPortion,
          paidUnits,
          unpaidUnits,
          startDate: new Date(`${startDate}T00:00:00.000Z`),
          endDate: new Date(`${endDate}T00:00:00.000Z`),
          reason,
          approvalStatus: "PENDING",
          createdByUserId: ctx.employeeId,
        },
      });

      return txn;
    });

    if (result === "leave_type_not_found") return err("Leave type not found", 404);

    return ok(serializeLeaveTransaction(result), "Leave request filed", 201);
  } catch (e) {
    console.error("[ess/leaves POST]", e);
    return serverError(e);
  }
}
