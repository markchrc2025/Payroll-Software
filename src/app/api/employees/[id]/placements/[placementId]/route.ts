/**
 * PATCH  /api/employees/[id]/placements/[placementId]  — update a placement record
 * DELETE /api/employees/[id]/placements/[placementId]  — delete a placement record
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

const patchSchema = z.object({
  effectiveDate: z.string().optional(),
  positionId:    z.string().optional().nullable(),
  jobTitle:      z.string().max(100).optional().nullable(),
  lineManagerId: z.string().optional().nullable(),
  departmentId:  z.string().optional().nullable(),
  branchId:      z.string().optional().nullable(),
  level:         z.string().max(50).optional().nullable(),
  remark:        z.string().max(200).optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string; placementId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id, placementId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const v = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.placement.findFirst({
      where: { id: placementId, employeeId: id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!existing) return { notFound: true as const };

    if (v.positionId) {
      const pos = await tx.position.findFirst({
        where: { id: v.positionId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!pos) return { error: "Position not found" as const };
    }
    if (v.lineManagerId) {
      const mgr = await tx.employee.findFirst({
        where: { id: v.lineManagerId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!mgr) return { error: "Line manager not found" as const };
    }
    if (v.departmentId) {
      const dept = await tx.department.findFirst({
        where: { id: v.departmentId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!dept) return { error: "Department not found" as const };
    }
    if (v.branchId) {
      const br = await tx.branch.findFirst({
        where: { id: v.branchId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!br) return { error: "Branch not found" as const };
    }

    const record = await tx.placement.update({
      where: { id: placementId },
      data: {
        ...(v.effectiveDate !== undefined && { effectiveDate: new Date(v.effectiveDate) }),
        ...(v.positionId    !== undefined && { positionId:    v.positionId    ?? null }),
        ...(v.jobTitle      !== undefined && { jobTitle:      v.jobTitle      ?? null }),
        ...(v.lineManagerId !== undefined && { lineManagerId: v.lineManagerId ?? null }),
        ...(v.departmentId  !== undefined && { departmentId:  v.departmentId  ?? null }),
        ...(v.branchId      !== undefined && { branchId:      v.branchId      ?? null }),
        ...(v.level         !== undefined && { level:         v.level         ?? null }),
        ...(v.remark        !== undefined && { remark:        v.remark        ?? null }),
      },
      include: {
        position:    { select: { id: true, title: true } },
        lineManager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        department:  { select: { id: true, name: true } },
        branch:      { select: { id: true, name: true } },
      },
    });
    return { record };
  });

  if ("notFound" in result) return notFound("Placement record");
  if ("error" in result && result.error) return err(result.error, 422);
  return ok(result.record, "Placement record updated");
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id, placementId } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.placement.findFirst({
      where: { id: placementId, employeeId: id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!existing) return { notFound: true as const };
    await tx.placement.delete({ where: { id: placementId } });
    return { ok: true as const };
  });

  if ("notFound" in result) return notFound("Placement record");
  return ok(null, "Placement record deleted");
}
