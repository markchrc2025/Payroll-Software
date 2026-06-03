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

    const book = await queueRun({
      tenantId: auth.tenantId,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      cycle: d.cycle,
      runType: d.runType,
      notes: d.notes ?? null,
      createdByUserId: auth.userId ?? null,
      employeeIds: d.employeeIds,
      skipStatutory: d.skipStatutory,
      separationReason: d.separationReason,
    });

    // Fire-and-forget enqueue — computation happens asynchronously
    void enqueuePayrollRun({ tenantId: auth.tenantId, bookId: book.id }).catch(
      (e) => console.error("[api/payroll/runs] Failed to enqueue payroll.run:", e),
    );

    return ok(serializePayrollBook(book), "Payroll run queued", 202);
  } catch (e) {
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
