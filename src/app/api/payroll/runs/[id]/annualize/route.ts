/**
 * POST /api/payroll/runs/[id]/annualize
 *
 * Year-End WHT Annualization (TRAIN / BIR RR 11-2018).
 * Delegates all business logic to runAnnualization() in @/lib/payroll/annualize.
 *
 * Requires PAYROLL:APPROVE permission.
 * Book must be a YEAR_END run that is still a DRAFT (PAY-155: a finalized run
 * is a sealed record and is never changed). 409 on a finalized run.
 * Idempotent.
 */

import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok, serverError } from "@/lib/api-response";
import {
  runAnnualization,
  AnnualizationBookNotFoundError,
  AnnualizationNotYearEndError,
  AnnualizationSealedError,
  AnnualizationNotDraftError,
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
    if (e instanceof AnnualizationSealedError)       return err(e.message, 409);
    if (e instanceof AnnualizationNotDraftError)     return err(e.message, 409);
    return serverError(e);
  }
}
