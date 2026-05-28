/**
 * GET  /api/employees/[id]/profile-update-requests — List requests for employee
 * POST /api/employees/[id]/profile-update-requests — File a new request
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

// Allowed fields that can be changed via a request workflow
const ALLOWED_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "preferredName",
  "birthDate",
  "gender",
  "civilStatus",
  "nationality",
  "phone",
  "mobilePhone",
  "personalEmail",
  "address",
  "city",
  "province",
  "zipCode",
  "bankAccountNumber",
  "bankAccountName",
  "bankCode",
] as const;

const createSchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
  newValue: z.string().min(1, "New value is required").max(500),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id: employeeId } = await params;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const employee = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id: employeeId, tenantId: auth.tenantId, deletedAt: null } })
  );
  if (!employee) return notFound("Employee not found");

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.profileUpdateRequest.findMany({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : {}),
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return ok(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!employee) return { notFound: true as const };

    // Capture current value for audit trail
    const oldValue = (employee as Record<string, unknown>)[parsed.data.field];

    const row = await tx.profileUpdateRequest.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        field: parsed.data.field,
        oldValue: oldValue != null ? String(oldValue) : null,
        newValue: parsed.data.newValue,
        status: "PENDING",
      },
    });
    return { notFound: false as const, row };
  });

  if (result.notFound) return notFound("Employee not found");
  return ok(result.row, "Profile update request filed", 201);
}
