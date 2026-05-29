/**
 * GET  /api/applicants/[id]/notes — List notes for an applicant
 * POST /api/applicants/[id]/notes — Add a note
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

const createNoteSchema = z.object({
  body: z.string().min(1).max(5000),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const applicant = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!applicant) return notFound("Applicant");

  const notes = await withTenant(ctx.tenantId, (tx) =>
    tx.applicantNote.findMany({
      where: { applicantId: id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  );

  return ok(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const applicant = await withTenant(ctx.tenantId, (tx) =>
    tx.applicant.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!applicant) return notFound("Applicant");

  const note = await withTenant(ctx.tenantId, (tx) =>
    tx.applicantNote.create({
      data: {
        tenantId: ctx.tenantId,
        applicantId: id,
        body: parsed.data.body,
        authorId: ctx.userId,
      },
    }),
  );

  return ok(note, "Note added", 201);
}
