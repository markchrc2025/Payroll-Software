/**
 * /api/payroll/runs/[id]/recompute
 *   POST — re-run the engine for a DRAFT book (deletes existing sheets).
 *          409 if the book is not DRAFT.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import {
  PayrollRunConflictError,
  PayrollRunNotFoundError,
  recomputeRun,
} from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const book = await recomputeRun(auth.tenantId, id);
    return ok(serializePayrollBook(book), "Payroll run recomputed");
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
