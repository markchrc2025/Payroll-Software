/**
 * GET  /api/ess/profile/update-requests — List own profile update requests
 * POST /api/ess/profile/update-requests — File a new profile update request
 *
 * GET query params:
 *   status — PENDING | APPROVED | REJECTED (optional)
 *
 * POST body:
 *   { field, newValue, reason? }
 *
 * Notes:
 *   • Only one PENDING request per field is allowed at a time.
 *   • Changes are NOT applied immediately — they require HR Admin approval.
 *   • Bank account / sensitive fields change must be verified by HR in person.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

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
  "mobileNumber",
  "personalEmail",
  "addressLine1",
  "addressLine2",
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
  reason: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  try {
    const rows = await withTenant(ctx.tenantId, (tx) =>
      tx.profileUpdateRequest.findMany({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          ...(status ? { status: status as never } : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    return ok(rows);
  } catch (e) {
    console.error("[ess/profile/update-requests GET]", e);
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation failed", 422, parsed.error.flatten());

  const { field, newValue, reason } = parsed.data;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Block duplicate PENDING request for the same field
      const existing = await tx.profileUpdateRequest.findFirst({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          field,
          status: "PENDING",
        },
      });
      if (existing) return "duplicate" as const;

      // Capture current value for the old value snapshot
      const employee = await tx.employee.findFirst({
        where: { id: ctx.employeeId, tenantId: ctx.tenantId },
      });
      const oldValue = employee
        ? String((employee as Record<string, unknown>)[field] ?? "")
        : undefined;

      const row = await tx.profileUpdateRequest.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          field,
          oldValue,
          newValue,
          ...(reason ? { rejectionReason: undefined } : {}),
          status: "PENDING",
        },
      });
      return row;
    });

    if (result === "duplicate") {
      return err(
        `A pending request for "${field}" already exists. Wait for HR to review it before filing another.`,
        409,
      );
    }

    return ok(result, "Profile update request filed. HR will review and apply the change.");
  } catch (e) {
    console.error("[ess/profile/update-requests POST]", e);
    return serverError(e);
  }
}
