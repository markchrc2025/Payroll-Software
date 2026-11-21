/**
 * /api/payroll/runs
 *   GET  — list payroll runs (filter: status, runType)
 *   POST — create a PROCESSING payroll run and enqueue the compute job.
 *          Returns 202 with the book stub; status transitions to DRAFT once
 *          the background job completes.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import {
  err,
  ok,
  paginated,
  serverError,
} from "@/lib/api-response";
import {
  queueRun,
  listRuns,
  PayrollRunConflictError,
} from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";
import {
  createPayrollRunSchema,
  listPayrollRunsSchema,
} from "@/lib/validations/payroll-run";
import { enqueuePayrollRun } from "@/lib/jobs/workers";
import { withTenant } from "@/lib/with-tenant";
import { paydaysFor } from "@/lib/payroll/pay-schedule-db";
import { parseYmd, ymd } from "@/lib/payroll/pay-schedule";

export async function GET(req: NextRequest) {
  try {
    const guard = await requirePermission(req, "PAYROLL", "READ");
    if (guard instanceof Response) return guard;
    const { ctx: auth } = guard;

    const qp = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = listPayrollRunsSchema.safeParse(qp);
    if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
    const { page, limit, status, runType } = parsed.data;

    const { total, rows } = await listRuns({
      tenantId: auth.tenantId,
      page,
      limit,
      status,
      runType,
    });
    return paginated(rows.map((r) => serializePayrollBook(r)), total, page, limit);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requirePermission(req, "PAYROLL", "CREATE");
    if (guard instanceof Response) return guard;
    const { ctx: auth } = guard;

    const body = await req.json().catch(() => null);
    const parsed = createPayrollRunSchema.safeParse(body);
    if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
    const d = parsed.data;

    // PAY-141: a regular run picked by payday gets its dates from the
    // company's schedule; the dates are not taken from the caller.
    let dates: { periodStart: Date; periodEnd: Date; payDate: Date | null; cutoffStart: Date | null; cutoffEnd: Date | null };
    if (d.payday) {
      if (d.cycle !== "SEMI_MONTHLY" && d.cycle !== "MONTHLY" && d.cycle !== "WEEKLY" && d.cycle !== "DAILY") {
        return err(`${d.cycle} has no pay schedule yet; give the dates instead.`, 422);
      }
      const cycle = d.cycle;
      const nominal = parseYmd(d.payday);
      const occ = await withTenant(auth.tenantId, async (tx) =>
        (await paydaysFor(tx, auth.tenantId, cycle, nominal, nominal)).find((o) => o.nominalDate === d.payday) ?? null,
      );
      if (!occ) return err(`${d.payday} is not a payday on the ${cycle.toLowerCase().replace("_", "-")} schedule.`, 422);
      if (
        (d.periodStart && ymd(d.periodStart) !== occ.periodStart) ||
        (d.periodEnd && ymd(d.periodEnd) !== occ.periodEnd)
      ) {
        return err(`The ${d.payday} payday covers ${occ.periodStart} to ${occ.periodEnd}; its dates cannot be changed.`, 422);
      }
      dates = {
        periodStart: parseYmd(occ.periodStart),
        periodEnd: parseYmd(occ.periodEnd),
        payDate: parseYmd(occ.payDate),
        cutoffStart: parseYmd(occ.cutoffStart),
        cutoffEnd: parseYmd(occ.cutoffEnd),
      };
    } else {
      // The schema guarantees both dates when there is no payday.
      dates = { periodStart: d.periodStart!, periodEnd: d.periodEnd!, payDate: null, cutoffStart: null, cutoffEnd: null };
    }

    const book = await queueRun({
      tenantId: auth.tenantId,
      ...dates,
      cycle: d.cycle,
      runType: d.runType,
      notes: d.notes ?? null,
      createdByUserId: auth.userId ?? null,
      employeeIds: d.employeeIds,
      skipStatutory: d.skipStatutory,
      separationReason: d.separationReason,
      includeThirteenthMonth: d.includeThirteenthMonth, // PAY-171
    });

    // Fire-and-forget enqueue — computation happens asynchronously
    void enqueuePayrollRun({ tenantId: auth.tenantId, bookId: book.id, enqueuedByUserId: auth.userId ?? null }).catch(
      (e) => console.error("[api/payroll/runs] Failed to enqueue payroll.run:", e),
    );

    return ok(serializePayrollBook(book), "Payroll run queued", 202);
  } catch (e) {
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
