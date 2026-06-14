/**
 * PATCH  /api/employees/[id]/employment-terms/[termId]  — update an employment term record
 * DELETE /api/employees/[id]/employment-terms/[termId]  — delete an employment term record
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

const patchSchema = z.object({
  effectiveDate:    z.string().optional(),
  jobType:          z.string().max(50).optional().nullable(),
  jobStatus:        z.string().max(50).optional().nullable(),
  leaveWorkflowKey: z.string().max(50).optional().nullable(),
  shiftScheduleId:  z.string().optional().nullable(),
  holidayKey:       z.string().max(50).optional().nullable(),
  termStart:        z.string().optional().nullable(),
  nextReviewDate:   z.string().optional().nullable(),
  remark:           z.string().max(200).optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string; termId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id, termId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const v = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employmentTerm.findFirst({
      where: { id: termId, employeeId: id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!existing) return { notFound: true as const };

    if (v.shiftScheduleId) {
      const sched = await tx.shiftSchedule.findFirst({
        where: { id: v.shiftScheduleId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!sched) return { error: "Shift schedule not found" as const };
    }

    const record = await tx.employmentTerm.update({
      where: { id: termId },
      data: {
        ...(v.effectiveDate    !== undefined && { effectiveDate:    new Date(v.effectiveDate) }),
        ...(v.jobType          !== undefined && { jobType:          v.jobType          ?? null }),
        ...(v.jobStatus        !== undefined && { jobStatus:        v.jobStatus        ?? null }),
        ...(v.leaveWorkflowKey !== undefined && { leaveWorkflowKey: v.leaveWorkflowKey ?? null }),
        ...(v.shiftScheduleId  !== undefined && { shiftScheduleId:  v.shiftScheduleId  ?? null }),
        ...(v.holidayKey       !== undefined && { holidayKey:       v.holidayKey       ?? null }),
        ...(v.termStart        !== undefined && { termStart: v.termStart ? new Date(v.termStart) : null }),
        ...(v.nextReviewDate   !== undefined && { nextReviewDate: v.nextReviewDate ? new Date(v.nextReviewDate) : null }),
        ...(v.remark           !== undefined && { remark:    v.remark    ?? null }),
      },
      include: { shiftSchedule: { select: { id: true, name: true } } },
    });
    return { record };
  });

  if ("notFound" in result) return notFound("Employment term record");
  if ("error" in result && result.error) return err(result.error, 422);
  return ok(result.record, "Employment term record updated");
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id, termId } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.employmentTerm.findFirst({
      where: { id: termId, employeeId: id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!existing) return { notFound: true as const };
    await tx.employmentTerm.delete({ where: { id: termId } });
    return { ok: true as const };
  });

  if ("notFound" in result) return notFound("Employment term record");
  return ok(null, "Employment term record deleted");
}
