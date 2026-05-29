/**
 * GET    /api/applicants/[id] — Get an applicant
 * PATCH  /api/applicants/[id] — Update applicant (stage, rating, contact info, etc.)
 * DELETE /api/applicants/[id] — Soft-delete
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";
import { updateApplicantSchema } from "@/lib/validations/ats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const applicant = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        jobPosting: { select: { id: true, title: true, code: true } },
        notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      },
    }),
  );

  if (!applicant) return notFound("Applicant");
  return ok(applicant);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateApplicantSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!existing) return notFound("Applicant");

  const updated = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.update({ where: { id }, data: d }),
  );

  return ok(updated, "Applicant updated");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, stage: true },
    }),
  );
  if (!existing) return notFound("Applicant");

  if (existing.stage === "HIRED") {
    return err("Cannot delete a HIRED applicant. Their employee record is linked.", 409);
  }

  await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.update({ where: { id }, data: { deletedAt: new Date() } }),
  );

  return ok({ id }, "Applicant deleted");
}
