/**
 * GET  /api/employees/[id]/ot-applications — List OT applications for employee
 * POST /api/employees/[id]/ot-applications — File a new OT application
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().date("Must be a valid date (YYYY-MM-DD)"),
  hours: z
    .number()
    .positive("Hours must be positive")
    .max(24, "Hours cannot exceed 24 per day"),
  justification: z.string().min(5, "Justification required (min 5 chars)").max(2000),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "READ");
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
    tx.oTApplication.findMany({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    })
  );

  return ok(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "CREATE");
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

    const row = await tx.oTApplication.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        date: new Date(parsed.data.date),
        hours: parsed.data.hours,
        justification: parsed.data.justification,
        status: "PENDING",
      },
    });
    return { notFound: false as const, row };
  });

  if (result.notFound) return notFound("Employee not found");
  return ok(result.row, "OT application filed", 201);
}
