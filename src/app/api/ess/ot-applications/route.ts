/**
 * GET  /api/ess/ot-applications — List own OT applications
 * POST /api/ess/ot-applications — File a new OT application
 *
 * GET query params:
 *   page   — default 1
 *   limit  — default 20, max 100
 *   status — PENDING | APPROVED | REJECTED | CANCELLED
 *
 * POST body:
 *   { date, hours, justification }
 *
 * Filing rules:
 *   • `date` must be a valid YYYY-MM-DD — cannot be more than 7 days in the past.
 *   • `hours` must be 0.5–16 (increments of 0.5).
 *   • The employee must not have an existing PENDING/APPROVED OT app for the same date.
 *   • Created with status PENDING — approval is done by Manager/HR in admin portal.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, paginated, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

const createSchema = z.object({
  date: z.string().date("Must be a valid date (YYYY-MM-DD)"),
  hours: z
    .number()
    .positive("Hours must be positive")
    .max(16, "OT hours cannot exceed 16 per day")
    .multipleOf(0.5, "Hours must be in 0.5 increments"),
  justification: z
    .string()
    .min(5, "Justification required (min 5 characters)")
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
        tx.oTApplication.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            ...(status ? { status: status as never } : {}),
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          skip,
          take: limit,
        }),
        tx.oTApplication.count({
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
    console.error("[ess/ot-applications GET]", e);
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

  const { date, hours, justification } = parsed.data;

  // Prevent filing for dates more than 7 days in the past
  const requestedDate = new Date(date + "T00:00:00.000Z");
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);
  if (requestedDate < sevenDaysAgo) {
    return err("OT date cannot be more than 7 days in the past", 422);
  }

  // Prevent future dates beyond today
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  if (requestedDate >= tomorrow) {
    return err("OT date cannot be in the future", 422);
  }

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Check for duplicate PENDING/APPROVED application on the same date
      const existing = await tx.oTApplication.findFirst({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          date: requestedDate,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      if (existing) return "duplicate" as const;

      const row = await tx.oTApplication.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          date: requestedDate,
          hours,
          justification,
          status: "PENDING",
        },
      });
      return row;
    });

    if (result === "duplicate") {
      return err("An OT application for this date already exists (PENDING or APPROVED)", 409);
    }

    return ok(result, "OT application filed successfully");
  } catch (e) {
    console.error("[ess/ot-applications POST]", e);
    return serverError(e);
  }
}
