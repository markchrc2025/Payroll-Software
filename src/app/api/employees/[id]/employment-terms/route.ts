/**
 * GET  /api/employees/[id]/employment-terms  — list all employment term records (newest first)
 * POST /api/employees/[id]/employment-terms  — create a new employment term record
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

const createSchema = z.object({
  effectiveDate:    z.string().min(1, "Effective date is required"),
  jobTypeId:        z.string().optional().nullable(),
  jobStatusId:      z.string().optional().nullable(),
  shiftScheduleId:  z.string().optional().nullable(),
  termStart:        z.string().optional().nullable(),
  nextReviewDate:   z.string().optional().nullable(),
  remark:           z.string().max(200).optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { notFound: true as const };

    const records = await tx.employmentTerm.findMany({
      where: { employeeId: id, tenantId: auth.tenantId },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      include: {
        shiftSchedule: { select: { id: true, name: true } },
        jobType: { select: { id: true, name: true } },
        jobStatus: { select: { id: true, name: true } },
      },
    });
    return { records };
  });

  if ("notFound" in result) return notFound("Employee");
  return ok(result.records);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const v = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { notFound: true as const };

    if (v.shiftScheduleId) {
      const sched = await tx.shiftSchedule.findFirst({
        where: { id: v.shiftScheduleId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!sched) return { error: "Shift schedule not found" as const };
    }

    const record = await tx.employmentTerm.create({
      data: {
        tenantId:         auth.tenantId,
        employeeId:       id,
        effectiveDate:    new Date(v.effectiveDate),
        jobTypeId:        v.jobTypeId        ?? null,
        jobStatusId:      v.jobStatusId      ?? null,
        shiftScheduleId:  v.shiftScheduleId  ?? null,
        termStart:        v.termStart ? new Date(v.termStart) : null,
        nextReviewDate:   v.nextReviewDate ? new Date(v.nextReviewDate) : null,
        remark:           v.remark    ?? null,
      },
      include: {
        shiftSchedule: { select: { id: true, name: true } },
        jobType: { select: { id: true, name: true } },
        jobStatus: { select: { id: true, name: true } },
      },
    });
    return { record };
  });

  if ("notFound" in result) return notFound("Employee");
  if ("error" in result && result.error) return err(result.error, 422);
  return ok(result.record, "Employment term record created", 201);
}
