/**
 * GET /api/payroll/reports/thirteenth-accrual?year=YYYY (PAY-152)
 *
 * The 13th month accrued so far this year, the projected payout and what was
 * paid, per employee and for the company, with the monthly journal.
 * Response: { data: ThirteenthAccrualReport }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { loadThirteenthAccrualReport } from "@/lib/payroll/thirteenth-accrual";

const querySchema = z.object({ year: z.coerce.number().int().min(2000).max(2099) });

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["REPORTS", "READ"]);
  if (denied) return denied;
  const parsed = querySchema.safeParse({ year: new URL(req.url).searchParams.get("year") ?? new Date().getUTCFullYear() });
  if (!parsed.success) return err("year must be from 2000 to 2099", 400);
  try {
    return ok(await withTenant(auth.tenantId, (tx) => loadThirteenthAccrualReport(tx, auth.tenantId, parsed.data.year)));
  } catch (e) {
    console.error("[thirteenth-accrual]", e);
    return err("Internal server error", 500);
  }
}
