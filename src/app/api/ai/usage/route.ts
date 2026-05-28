/**
 * GET /api/ai/usage — AI usage metering report
 *
 * Returns daily and per-touchpoint token/cost summaries for the calling tenant.
 * Permission: REPORTS:READ
 * Feature flag: featureFlags.ai_enabled (not gated — admins should always
 *   be able to see usage even if the feature is currently disabled)
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "REPORTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const url = new URL(req.url);
  const rawFrom = url.searchParams.get("from");
  const rawTo   = url.searchParams.get("to");

  if (rawFrom && isNaN(Date.parse(rawFrom))) return err("Invalid 'from' date", 400);
  if (rawTo   && isNaN(Date.parse(rawTo)))   return err("Invalid 'to' date",   400);

  // Default: last 30 days
  const to   = rawTo   ? new Date(rawTo)   : new Date();
  const from = rawFrom ? new Date(rawFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Daily totals
    const rows = await prismaAdmin.aiUsage.findMany({
      where: {
        tenantId:  ctx.tenantId,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id:           true,
        touchpoint:   true,
        model:        true,
        inputTokens:  true,
        outputTokens: true,
        cachedTokens: true,
        costMicroUsd: true,
        createdAt:    true,
      },
      take: 1000,
    });

    // Aggregate per touchpoint
    const byTouchpoint: Record<string, {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      costMicroUsd: string;
    }> = {};
    let totalCost = 0n;
    for (const r of rows) {
      const tp = r.touchpoint;
      if (!byTouchpoint[tp]) {
        byTouchpoint[tp] = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: "0" };
      }
      byTouchpoint[tp].calls        += 1;
      byTouchpoint[tp].inputTokens  += r.inputTokens;
      byTouchpoint[tp].outputTokens += r.outputTokens;
      const existing = BigInt(byTouchpoint[tp].costMicroUsd);
      byTouchpoint[tp].costMicroUsd  = String(existing + (r.costMicroUsd as bigint));
      totalCost += r.costMicroUsd as bigint;
    }

    return ok({
      from:               from.toISOString(),
      to:                 to.toISOString(),
      totalCalls:         rows.length,
      totalCostMicroUsd:  String(totalCost),
      byTouchpoint,
      // Most recent 50 rows for debugging
      recentRows: rows.slice(0, 50).map((r) => ({
        ...r,
        costMicroUsd: String(r.costMicroUsd),
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}
