/**
 * GET /api/ess/lookups/[list]: the company lists an employee picks from in
 * ESS (Wave A2, PAY-209): expense categories and types, and banks for payout
 * account requests. Active items only; no personal data.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { listItems } from "@/lib/lookups/store";

const ESS_LISTS = new Set(["EXPENSE_CATEGORY", "EXPENSE_TYPE", "BANK"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ list: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { list } = await params;
  if (!ESS_LISTS.has(list)) return err("Unknown list", 404);
  const items = await withTenant(ctx.tenantId, (tx) => listItems(tx, ctx.tenantId, list));
  return ok(items.map((i) => ({ id: i.id, code: i.code, name: i.name, attributes: i.attributes })));
}
