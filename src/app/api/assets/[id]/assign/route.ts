/**
 * POST /api/assets/[id]/assign — Assign an asset to an employee.
 *
 * Rules:
 * - Asset must be AVAILABLE (not currently assigned).
 * - Employee must belong to the same tenant.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { assignAssetSchema } from "@/lib/validations/asset";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = assignAssetSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { employeeId, conditionAtAssign, assignmentNotes } = parsed.data;

  const [asset, employee] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.asset.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
      tx.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, deletedAt: null } }),
    ]),
  );

  if (!asset) return notFound("Asset");
  if (!employee) return notFound("Employee");

  const activeAssignment = await withTenant(ctx.tenantId, (tx) =>
    tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } }),
  );
  if (activeAssignment) return err("Asset is already assigned. Return it before reassigning.", 409);

  const [assignment] = await withTenant(ctx.tenantId, (tx) =>
    Promise.all([
      tx.assetAssignment.create({
        data: {
          tenantId: ctx.tenantId,
          assetId: id,
          employeeId,
          conditionAtAssign: conditionAtAssign ?? "GOOD",
          assignmentNotes: assignmentNotes ?? null,
          assignedByUserId: ctx.userId,
        },
        include: {
          employee: {
            select: { id: true, employeeNumber: true, firstName: true, lastName: true },
          },
        },
      }),
      tx.asset.update({ where: { id }, data: { status: "ASSIGNED" } }),
    ]),
  );

  return ok(assignment, "Asset assigned", 201);
}
