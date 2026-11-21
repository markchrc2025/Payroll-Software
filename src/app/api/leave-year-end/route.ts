/**
 * Wave E2 (PAY-215): the leave year end (src/lib/leave/year-end.ts).
 *   GET   ?year=  what carrying over, converting and forfeiting would do (LEAVES:READ)
 *   POST  { year, payrollRunId? }  do it; converted leave lands as adjustments
 *         on the draft run (LEAVES:UPDATE and PAYROLL:UPDATE). Twice changes nothing.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { applyYearEnd, planYearEnd, YearEndRefusal } from "@/lib/leave/year-end";

const yearOf = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null; };

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  const year = yearOf(new URL(req.url).searchParams.get("year"));
  if (!year) return err("Choose the year", 422);
  try {
    return ok(await withTenant(auth.tenantId, (tx) => planYearEnd(tx, auth.tenantId, year)));
  } catch (e) {
    if (e instanceof YearEndRefusal) return err(e.message, 422);
    throw e;
  }
}

const body = z.object({ year: z.number().int().min(2000).max(2100), payrollRunId: z.string().min(1).nullable().optional() });

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = (await forbidUnless(auth, ["LEAVES", "UPDATE"])) ?? (await forbidUnless(auth, ["PAYROLL", "UPDATE"]));
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Choose the year", 422);
  try {
    const r = await withTenant(auth.tenantId, (tx) => applyYearEnd(tx, auth.tenantId, parsed.data.year, parsed.data.payrollRunId ?? null));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "LeaveYearEnd", entityId: String(parsed.data.year), changes: { ...r, payrollRunId: parsed.data.payrollRunId ?? null }, ipAddress: getClientIp(req) });
    return ok(r, `Year end ${parsed.data.year} done for ${r.processed} balance(s). Recompute the payroll run to include converted leave.`);
  } catch (e) {
    if (e instanceof YearEndRefusal) return err(e.message, 422);
    throw e;
  }
}
