/**
 * POST /api/applicants/[id]/advance
 *
 * Advances the applicant's stage by one step:
 *   APPLIED → SCREENING → INTERVIEW → OFFER
 * Cannot advance past OFFER (use /hire for that).
 * Cannot advance if stage is HIRED, REJECTED, or WITHDRAWN.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

const STAGE_PROGRESSION: Record<string, string> = {
  APPLIED: "SCREENING",
  SCREENING: "INTERVIEW",
  INTERVIEW: "OFFER",
};

const TERMINAL_STAGES = new Set(["OFFER", "HIRED", "REJECTED", "WITHDRAWN"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const applicant = await tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!applicant) return { notFound: true as const };

    if (TERMINAL_STAGES.has(applicant.stage)) {
      return { error: `Cannot advance applicant in stage ${applicant.stage}` };
    }

    const nextStage = STAGE_PROGRESSION[applicant.stage];
    if (!nextStage) {
      return { error: `No next stage for ${applicant.stage}` };
    }

    const updated = await tx.applicant.update({
      where: { id },
      data: { stage: nextStage as never },
      include: { jobPosting: { select: { id: true, title: true, code: true } } },
    });
    return { applicant: updated };
  });

  if ("notFound" in result) return notFound("Applicant");
  if ("error" in result) return err(result.error as string, 409);
  return ok(result.applicant);
}
