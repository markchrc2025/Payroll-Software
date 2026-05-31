/**
 * /api/payroll/runs
 *   GET  — list payroll runs (filter: status, runType)
 *   POST — create a DRAFT payroll run (auto-fans-out compute across employees)
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
  createDraftRun,
  listRuns,
  PayrollRunConflictError,
} from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";
import {
  createPayrollRunSchema,
  listPayrollRunsSchema,
} from "@/lib/validations/payroll-run";

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

    const book = await createDraftRun({
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
    return ok(serializePayrollBook(book), "Payroll run created", 201);
  } catch (e) {
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
