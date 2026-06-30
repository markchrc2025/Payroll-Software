/**
 * /api/employees/[id]/training
 *   GET  — list an employee's trainings (with a short-lived certificate URL)
 *   POST — add a training record (optionally referencing an uploaded R2 cert)
 *
 * Requires EMPLOYEES:READ (GET) / EMPLOYEES:UPDATE (POST).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { resolveObjectUrl } from "@/lib/r2";
import { trainingSchema } from "@/lib/validations/employee-background";

const SELECT = {
  id: true, title: true, provider: true, trainingDate: true, hours: true,
  certificateKey: true, certificateFileName: true, certificateMimeType: true,
  certificateFileSize: true, expiresAt: true, notes: true,
  createdAt: true, updatedAt: true,
} as const;

/** Certificate keys must live under this employee's training prefix. */
function certPrefix(tenantId: string, employeeId: string) {
  return `tenants/${tenantId}/employees/${employeeId}/training/`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const rows = await withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } });
    if (!emp) return null;
    return tx.employeeTraining.findMany({
      where: { employeeId: id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
      select: SELECT,
    });
  });
  if (rows === null) return notFound("Employee");

  // Resolve a browser-loadable URL for any attached certificate (best-effort).
  const withUrls = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      certificateUrl: r.certificateKey ? await resolveObjectUrl(r.certificateKey, { expiresIn: 600 }) : null,
    })),
  );
  return ok(withUrls);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = trainingSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  if (parsed.data.certificateKey && !parsed.data.certificateKey.startsWith(certPrefix(ctx.tenantId, id))) {
    return err("certificateKey does not belong to this employee", 400);
  }

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, select: { id: true } });
      if (!emp) return { notFound: true as const };
      const row = await tx.employeeTraining.create({
        data: { employeeId: id, tenantId: ctx.tenantId, createdByUserId: ctx.userId, ...parsed.data },
        select: SELECT,
      });
      return { row };
    });
    if ("notFound" in result) return notFound("Employee");
    void writeAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "CREATE",
      entity: "EmployeeTraining", entityId: result.row.id,
      changes: JSON.parse(JSON.stringify(parsed.data)), ipAddress: getClientIp(req),
    });
    return ok(result.row, "Training added", 201);
  } catch (e) {
    return serverError(e);
  }
}
