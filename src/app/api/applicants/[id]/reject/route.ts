/**
 * POST /api/applicants/[id]/reject
 *
 * Sets the applicant's stage to REJECTED.
 * Body: { rejectionReason: string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

const schema = z.object({
  rejectionReason: z.string().min(1).max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const applicant = await tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!applicant) return { notFound: true as const };
    if (applicant.stage === "HIRED") {
      return { error: "Cannot reject an already hired applicant" };
    }

    const updated = await tx.applicant.update({
      where: { id },
      data: {
        stage: "REJECTED",
        rejectionReason: parsed.data.rejectionReason,
      },
      include: { jobPosting: { select: { id: true, title: true, code: true } } },
    });
    return { applicant: updated };
  });

  if ("notFound" in result) return notFound("Applicant");
  if ("error" in result) return err(result.error as string, 409);
  return ok(result.applicant, "Applicant rejected");
}
