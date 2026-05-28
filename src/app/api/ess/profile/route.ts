/**
 * GET /api/ess/profile
 *
 * Returns the authenticated employee's own profile.
 * Excludes sensitive fields (TIN, SSS numbers, bank account — those are
 * encrypted at rest and not surfaced in ESS; HR manages them in the admin
 * portal).
 *
 * Response: { data: EssProfile }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { notFound, ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  try {
    const profile = await withTenant(ctx.tenantId, async (tx) => {
      return tx.employee.findFirst({
        where: { id: ctx.employeeId, tenantId: ctx.tenantId, deletedAt: null },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          suffix: true,
          preferredName: true,
          birthDate: true,
          gender: true,
          civilStatus: true,
          nationality: true,
          personalEmail: true,
          mobileNumber: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          province: true,
          zipCode: true,
          region: true,
          employmentStatus: true,
          employmentType: true,
          hireDate: true,
          regularizationDate: true,
          payFrequency: true,
          taxClassification: true,
          department: { select: { name: true } },
          branch: { select: { name: true } },
          position: { select: { title: true, level: true } },
        },
      });
    });

    if (!profile) return notFound("Employee");
    return ok(profile, "Profile retrieved");
  } catch (e) {
    console.error("[ess/profile]", e);
    return serverError(e);
  }
}
