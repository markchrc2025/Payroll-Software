/**
 * /api/payroll/runs
 *   GET  — list payroll runs (filter: status, runType)
 *   POST — create a DRAFT payroll run (auto-fans-out compute across employees)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  ok,
  paginated,
  serverError,
  unauthorized,
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
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

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
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createPayrollRunSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  try {
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
    });
    return ok(serializePayrollBook(book), "Payroll run created", 201);
  } catch (e) {
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
