/**
 * /api/payroll/runs/[id]/recompute
 *   POST — re-run the engine for a DRAFT book (deletes existing sheets).
 *          409 if the book is not DRAFT.
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
  PayrollRunConflictError,
  PayrollRunNotFoundError,
  recomputeRun,
} from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";
import prismaAdmin from "@/lib/prisma-admin";
import { notifyDtrGaps } from "@/lib/payroll/dtr-gap-notify";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const book = await recomputeRun(auth.tenantId, id);
    // PAY-172: warn HR and supervisors about employees without approved DTR.
    void notifyDtrGaps(prismaAdmin, auth.tenantId, id).catch((e) =>
      console.error(`[api/payroll/runs/recompute] DTR warning email failed for ${id}:`, e),
    );
    return ok(serializePayrollBook(book), "Payroll run recomputed");
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    if (e instanceof PayrollRunConflictError) return err(e.message, 409);
    return serverError(e);
  }
}
