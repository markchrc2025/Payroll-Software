/**
 * GET  /api/ess/undertime — List own undertime requests
 * POST /api/ess/undertime — File a new undertime request
 *
 * GET query params:
 *   page   — default 1
 *   limit  — default 20, max 100
 *   status — PENDING | APPROVED | REJECTED | CANCELLED
 *
 * POST body:
 *   { date, undertimeMinutes, reason }
 *
 * Rules:
 *   • date must be today or up to 7 days in the past.
 *   • undertimeMinutes must be 1–480 (max 8 hours).
 *   • One PENDING/APPROVED undertime per date allowed.
 *   • On approval the linked DTRRecord.undertimeMinutes is updated by HR.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, paginated, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { snapshotApprovalChain } from "@/lib/approvals/snapshot";

const createSchema = z.object({
  date: z.string().date("Must be a valid date (YYYY-MM-DD)"),
  undertimeMinutes: z
    .number()
    .int("Must be a whole number of minutes")
    .min(1, "Undertime must be at least 1 minute")
    .max(480, "Undertime cannot exceed 480 minutes (8 hours)"),
  reason: z
    .string()
    .min(5, "Reason required (min 5 characters)")
    .max(2000),
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const status = searchParams.get("status") ?? undefined;
  const skip = (page - 1) * limit;

  try {
    const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
      Promise.all([
        tx.undertimeRequest.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            ...(status ? { status: status as never } : {}),
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          skip,
          take: limit,
        }),
        tx.undertimeRequest.count({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            ...(status ? { status: status as never } : {}),
          },
        }),
      ]),
    );

    return paginated(rows, total, page, limit);
  } catch (e) {
    console.error("[ess/undertime GET]", e);
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const { date, undertimeMinutes, reason } = parsed.data;

  const requestedDate = new Date(date + "T00:00:00.000Z");

  // Allow only today or up to 7 days in the past
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);
  if (requestedDate < sevenDaysAgo) {
    return err("Undertime date cannot be more than 7 days in the past", 422);
  }
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  if (requestedDate >= tomorrow) {
    return err("Undertime date cannot be in the future", 422);
  }

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.undertimeRequest.findFirst({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          date: requestedDate,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      if (existing) return "duplicate" as const;

      const row = await tx.undertimeRequest.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          date: requestedDate,
          undertimeMinutes,
          reason,
          status: "PENDING",
        },
      });

      // Snapshot the approval chain. If no steps are configured for this
      // employee, auto-approve immediately (aggregator excuses APPROVED rows).
      const snap = await snapshotApprovalChain(tx, {
        module: "UNDERTIME",
        entityId: row.id,
        requesterId: ctx.employeeId,
        tenantId: ctx.tenantId,
      });

      if (snap.activeSteps === 0) {
        const approved = await tx.undertimeRequest.update({
          where: { id: row.id },
          data: { status: "APPROVED", approvedAt: new Date() },
        });
        return approved;
      }

      return row;
    });

    if (result === "duplicate") {
      return err("An undertime request for this date already exists (PENDING or APPROVED)", 409);
    }

    return ok(result, "Undertime request filed successfully");
  } catch (e) {
    console.error("[ess/undertime POST]", e);
    return serverError(e);
  }
}
