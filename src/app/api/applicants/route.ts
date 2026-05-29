/**
 * GET  /api/applicants — List applicants (filter: jobPostingId, stage, source)
 * POST /api/applicants — Create an applicant
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok, paginated } from "@/lib/api-response";
import { createApplicantSchema, listApplicantsSchema } from "@/lib/validations/ats";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const q = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listApplicantsSchema.safeParse(q);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { jobPostingId, stage, source, includeDeleted, page, limit } = parsed.data;

  const where = {
    tenantId: ctx.tenantId,
    ...(jobPostingId ? { jobPostingId } : {}),
    ...(stage ? { stage } : {}),
    ...(source ? { source } : {}),
    ...(!includeDeleted ? { deletedAt: null } : {}),
  };

  const skip = (page - 1) * limit;
  const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.applicant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          jobPosting: { select: { id: true, title: true, code: true } },
        },
      }),
      tx.applicant.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const parsed = createApplicantSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  // Validate job posting belongs to this tenant and is not closed/deleted
  const posting = await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.findFirst({
      where: { id: d.jobPostingId, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, status: true },
    }),
  );
  if (!posting) return notFound("JobPosting");
  if (posting.status === "CLOSED") {
    return err("Cannot add applicants to a CLOSED job posting", 422);
  }

  const applicant = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.create({
      data: {
        tenantId: ctx.tenantId,
        jobPostingId: d.jobPostingId,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email ?? null,
        phone: d.phone ?? null,
        source: d.source,
        assignedToUserId: d.assignedToUserId ?? null,
        stage: "APPLIED",
      },
    }),
  );

  return ok(applicant, "Applicant created", 201);
}
