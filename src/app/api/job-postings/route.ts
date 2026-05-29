/**
 * GET  /api/job-postings — List job postings (filter: status, departmentId, branchId, positionId)
 * POST /api/job-postings — Create a job posting
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, ok, paginated, unauthorized } from "@/lib/api-response";
import { createJobPostingSchema, listJobPostingsSchema } from "@/lib/validations/ats";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const q = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listJobPostingsSchema.safeParse(q);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { status, departmentId, branchId, positionId, includeDeleted, page, limit } = parsed.data;

  const where = {
    tenantId: ctx.tenantId,
    ...(status ? { status } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(positionId ? { positionId } : {}),
    ...(!includeDeleted ? { deletedAt: null } : {}),
  };

  const skip = (page - 1) * limit;
  const [rows, total] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.jobPosting.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      tx.jobPosting.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const parsed = createJobPostingSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  // Check code uniqueness
  if (d.code) {
    const existing = await withTenant(ctx.tenantId, (tx) =>
      tx.jobPosting.findFirst({
        where: { tenantId: ctx.tenantId, code: d.code, deletedAt: null },
        select: { id: true },
      }),
    );
    if (existing) return err(`Job posting code "${d.code}" already exists`, 409);
  }

  const posting = await withTenant(ctx.tenantId, (tx) =>
    tx.jobPosting.create({
      data: {
        tenantId: ctx.tenantId,
        title: d.title,
        code: d.code ?? null,
        description: d.description ?? null,
        departmentId: d.departmentId ?? null,
        branchId: d.branchId ?? null,
        positionId: d.positionId ?? null,
        headcount: d.headcount,
        status: d.status,
        openedAt: d.openedAt ?? null,
        closedAt: d.closedAt ?? null,
        createdById: ctx.userId ?? null,
      },
    }),
  );

  return ok(posting, "Job posting created", 201);
}
