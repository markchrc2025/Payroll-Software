/**
 * POST /api/payroll/runs/[id]/annualize
 *
 * Year-End WHT Annualization (TRAIN / BIR RR 11-2018).
 * Delegates all business logic to runAnnualization() in @/lib/payroll/annualize.
 *
 * Requires PAYROLL:APPROVE permission.
 * Book must be YEAR_END + FINALIZED.
 * Idempotent.
 */

import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok, serverError } from "@/lib/api-response";
import {
  runAnnualization,
  AnnualizationBookNotFoundError,
  AnnualizationNotYearEndError,
  AnnualizationNotFinalizedError,
} from "@/lib/payroll/annualize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const summary = await runAnnualization(auth.tenantId, id);
    return ok(
      {
        ...summary,
        netTrueUpCents: summary.netTrueUpCents.toString(),
      },
      "Year-end annualization complete",
    );
  } catch (e) {
    if (e instanceof AnnualizationBookNotFoundError) return notFound("PayrollBook");
    if (e instanceof AnnualizationNotYearEndError)   return err(e.message, 400);
    if (e instanceof AnnualizationNotFinalizedError) return err(e.message, 400);
    return serverError(e);
  }
}
