/**
 * /api/payroll/runs/[id]/adjustments
 *   GET  — list all adjustments for the payroll book
 *   POST — add a new adjustment (book must be DRAFT)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { serializePayrollAdjustment } from "@/lib/payroll/serialize";
import { createAdjustmentSchema } from "@/lib/validations/payroll-run";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const adjustments = await withTenant(auth.tenantId, (tx) =>
      tx.payrollAdjustment.findMany({
        where: { payrollBookId: id, tenantId: auth.tenantId },
        orderBy: { createdAt: "asc" },
      }),
    );
    return ok(adjustments.map(serializePayrollAdjustment));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = createAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation error", 400, parsed.error.flatten().fieldErrors);
  }
  const { employeeId, kind, amountCents, isTaxable, reason } = parsed.data;

  try {
    const adjustment = await withTenant(auth.tenantId, async (tx) => {
      // Verify book exists, belongs to tenant, and is still DRAFT.
      const book = await tx.payrollBook.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!book) throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      if (book.status !== "DRAFT") {
        throw Object.assign(new Error("Run is not in DRAFT status"), { code: "CONFLICT" });
      }

      // Verify employee belongs to this tenant.
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId: auth.tenantId },
      });
      if (!employee) {
        throw Object.assign(new Error("Employee not found"), { code: "NOT_FOUND" });
      }

      return tx.payrollAdjustment.create({
        data: {
          tenantId: auth.tenantId,
          employeeId,
          payrollBookId: id,
          kind,
          amountCents,
          isTaxable,
          reason,
        },
      });
    });
    return ok(serializePayrollAdjustment(adjustment), undefined, 201);
  } catch (e: unknown) {
    if (e instanceof Error) {
      const code = (e as { code?: string }).code;
      if (code === "NOT_FOUND") return notFound("PayrollBook or Employee");
      if (code === "CONFLICT") return err(e.message, 409);
    }
    return serverError(e);
  }
}
