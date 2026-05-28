/**
 * /api/payroll/runs/[id]/finalize
 *   POST — transition DRAFT → FINALIZED (decrement loan balances + AuditLog).
 *          Idempotent: re-finalize on a FINALIZED book is a no-op.
 *          409 on CANCELLED.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import {
  err,
  notFound,
  ok,
  serverError,
} from "@/lib/api-response";
import {
  finalizeRun,
  PayrollRunConflictError,
  PayrollRunNotFoundError,
} from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const book = await finalizeRun(auth.tenantId, id, auth.userId ?? null);
    return ok(serializePayrollBook(book), "Payroll run finalized");
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
