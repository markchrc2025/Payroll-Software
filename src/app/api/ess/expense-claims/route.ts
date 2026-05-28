/**
 * GET  /api/ess/expense-claims   — list own expense claims
 * POST /api/ess/expense-claims   — create a new DRAFT expense claim
 *
 * GET query params:
 *   page   — default 1
 *   limit  — default 10, max 50
 *   status — filter (DRAFT | SUBMITTED | APPROVED | REJECTED | ATTACHED | PAID)
 *
 * POST body:
 *   { category, description, amountCents, claimDate, receiptKey? }
 *
 * Notes:
 *   • New claims are created with status DRAFT; employee submits via the
 *     existing admin route (or a future ESS submit endpoint).
 *   • Tax treatment is set by Finance/HR at approval time.
 *   • amountCents must be > 0.
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
import { centavosToJson } from "@/lib/money";

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
    const [claims, total] = await withTenant(ctx.tenantId, async (tx) =>
      Promise.all([
        tx.expenseClaim.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            ...(status ? { status: status as never } : {}),
          },
          orderBy: { claimDate: "desc" },
          skip,
          take: limit,
        }),
        tx.expenseClaim.count({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            ...(status ? { status: status as never } : {}),
          },
        }),
      ]),
    );

    const serialized = claims.map((c) => ({
      ...c,
      amountCents: centavosToJson(c.amountCents),
    }));

    return paginated(serialized, total, page, limit);
  } catch (e) {
    console.error("[ess/expense-claims GET]", e);
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
const CreateClaimSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  /** Amount in centavos (integer). */
  amountCents: z.number().int().positive().max(100_000_000), // max ₱1,000,000
  claimDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptKey: z.string().max(500).optional(),
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

  const parsed = CreateClaimSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { category, description, amountCents, claimDate, receiptKey } =
    parsed.data;

  try {
    const claim = await withTenant(ctx.tenantId, (tx) =>
      tx.expenseClaim.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          category,
          description,
          amountCents: BigInt(amountCents),
          claimDate: new Date(`${claimDate}T00:00:00.000Z`),
          receiptKey,
          status: "DRAFT",
        },
      }),
    );

    return ok(
      { ...claim, amountCents: centavosToJson(claim.amountCents) },
      "Expense claim created",
      201,
    );
  } catch (e) {
    console.error("[ess/expense-claims POST]", e);
    return serverError(e);
  }
}
