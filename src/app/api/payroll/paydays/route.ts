/**
 * GET /api/payroll/paydays?cycle=SEMI_MONTHLY (PAY-141)
 *
 * The paydays the New Run screen offers for a cycle: about two months back to
 * two months ahead, each with its pay date (moved back off Sundays and
 * holidays), pay period and DTR cutoff, and the regular run already created
 * for it, if any. Dates are filled from this and locked in the screen.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { err, ok, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { paydaysFor } from "@/lib/payroll/pay-schedule-db";
import { parseYmd } from "@/lib/payroll/pay-schedule";

const query = z.object({ cycle: z.enum(["SEMI_MONTHLY", "MONTHLY", "WEEKLY", "DAILY"]) });

export async function GET(req: NextRequest) {
  try {
    const guard = await requirePermission(req, "PAYROLL", "READ");
    if (guard instanceof Response) return guard;
    const { ctx: auth } = guard;
    const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
    const { cycle } = parsed.data;

    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const span = cycle === "DAILY" ? 14 : 62;
    const from = new Date(today - span * 86_400_000);
    const to = new Date(today + span * 86_400_000);

    const rows = await withTenant(auth.tenantId, async (tx) => {
      const occ = await paydaysFor(tx, auth.tenantId, cycle, from, to);
      if (occ.length === 0) return [];
      const books = await tx.payrollBook.findMany({
        where: {
          tenantId: auth.tenantId,
          runType: "REGULAR",
          periodStart: { in: [...new Set(occ.map((o) => parseYmd(o.periodStart)))] },
        },
        select: { id: true, periodStart: true, periodEnd: true, status: true },
      });
      const key = (s: Date, e: Date) => `${s.toISOString().slice(0, 10)}..${e.toISOString().slice(0, 10)}`;
      const byPeriod = new Map(books.map((b) => [key(b.periodStart, b.periodEnd), b]));
      return occ.map((o) => {
        const b = byPeriod.get(`${o.periodStart}..${o.periodEnd}`);
        return { ...o, existingRun: b ? { id: b.id, status: b.status } : null };
      });
    });
    return ok({ cycle, today: new Date(today).toISOString().slice(0, 10), paydays: rows });
  } catch (e) {
    return serverError(e);
  }
}
