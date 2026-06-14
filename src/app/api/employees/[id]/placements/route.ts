/**
 * GET  /api/employees/[id]/placements  — list all placement records (newest first)
 * POST /api/employees/[id]/placements  — create a new placement record
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

const createSchema = z.object({
  effectiveDate: z.string().min(1, "Effective date is required"),
  positionId:    z.string().optional().nullable(),
  jobTitle:      z.string().max(100).optional().nullable(),
  lineManagerId: z.string().optional().nullable(),
  departmentId:  z.string().optional().nullable(),
  branchId:      z.string().optional().nullable(),
  level:         z.string().max(50).optional().nullable(),
  remark:        z.string().max(200).optional().nullable(),
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

    const records = await tx.placement.findMany({
      where: { employeeId: id, tenantId: auth.tenantId },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      include: {
        position:    { select: { id: true, title: true } },
        lineManager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        department:  { select: { id: true, name: true } },
        branch:      { select: { id: true, name: true } },
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

    const record = await tx.placement.create({
      data: {
        tenantId:      auth.tenantId,
        employeeId:    id,
        effectiveDate: new Date(v.effectiveDate),
        positionId:    v.positionId  ?? null,
        jobTitle:      v.jobTitle    ?? null,
        lineManagerId: v.lineManagerId ?? null,
        departmentId:  v.departmentId  ?? null,
        branchId:      v.branchId      ?? null,
        level:         v.level   ?? null,
        remark:        v.remark  ?? null,
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

  if ("notFound" in result) return notFound("Employee");
  if ("error" in result && result.error) return err(result.error, 422);
  return ok(result.record, "Placement record created", 201);
}
