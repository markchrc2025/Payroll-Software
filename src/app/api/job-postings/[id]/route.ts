/**
 * GET    /api/job-postings/[id] — Get a job posting
 * PATCH  /api/job-postings/[id] — Update a job posting
 * DELETE /api/job-postings/[id] — Soft-delete (only DRAFT or CLOSED)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updateJobPostingSchema } from "@/lib/validations/ats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const posting = await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
        _count: { select: { applicants: { where: { deletedAt: null } } } },
      },
    }),
  );

  if (!posting) return notFound("JobPosting");
  return ok(posting);
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
  const parsed = updateJobPostingSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const existing = await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, code: true },
    }),
  );
  if (!existing) return notFound("JobPosting");

  // Check code uniqueness if changing code
  if (d.code && d.code !== existing.code) {
    const dup = await withTenant(ctx.tenantId, (tx) =>
      tx.jobPosting.findFirst({
        where: { tenantId: ctx.tenantId, code: d.code, deletedAt: null, id: { not: id } },
        select: { id: true },
      }),
    );
    if (dup) return err(`Job posting code "${d.code}" already exists`, 409);
  }

  const updated = await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.update({ where: { id }, data: d }),
  );

  return ok(updated, "Job posting updated");
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
    tx.jobPosting.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, status: true },
    }),
  );
  if (!existing) return notFound("JobPosting");

  if (existing.status === "OPEN" || existing.status === "ON_HOLD") {
    return err("Cannot delete an OPEN or ON_HOLD job posting. Close it first.", 409);
  }

  await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.update({ where: { id }, data: { deletedAt: new Date() } }),
  );

  return ok({ id }, "Job posting deleted");
}
