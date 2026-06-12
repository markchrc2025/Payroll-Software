/**
 * GET /api/ess/profile
 *
 * Returns the authenticated employee's own profile for the ESS app, including
 * their company, manager, and — masked to the last few characters — their bank
 * account and government IDs (the employee's own data, surfaced read-only).
 * Full values remain encrypted at rest; HR edits them in the admin portal.
 *
 * Response: { data: EssProfile }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { notFound, ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { decrypt } from "@/lib/crypto";

/** Mask a sensitive value to its last `keep` characters, e.g. "•••• 3344". */
function mask(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= keep) return v;
  return "•••• " + v.slice(-keep);
}

function fullName(p: { firstName: string; lastName: string } | null | undefined): string | null {
  if (!p) return null;
  return `${p.firstName} ${p.lastName}`.trim();
}

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
          bankName: true,
          bankAccountNumber: true,
          department: { select: { name: true } },
          branch: { select: { name: true } },
          position: { select: { title: true, level: true } },
          tenant: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true } },
          immediateSupervisor: { select: { firstName: true, lastName: true } },
          statutoryIds: { select: { type: true, number: true } },
        },
      });
    });

    if (!profile) return notFound("Employee");

    const { statutoryIds, bankName, bankAccountNumber, tenant, manager, immediateSupervisor, ...rest } =
      profile;

    // Bank + government IDs are AES-encrypted at rest. decrypt() is a no-op when
    // the value was already decrypted by the Prisma client extension, so calling
    // it defensively is safe either way. We only ever return masked values.
    const gov: Record<string, string | null> = {
      SSS: null,
      PHILHEALTH: null,
      PAGIBIG: null,
      TIN: null,
      GSIS: null,
    };
    for (const s of statutoryIds ?? []) {
      gov[s.type] = mask(decrypt(s.number), 4);
    }

    return ok(
      {
        ...rest,
        company: tenant?.name ?? null,
        manager: fullName(manager) ?? fullName(immediateSupervisor),
        bank: {
          name: bankName ?? null,
          accountMasked: mask(decrypt(bankAccountNumber), 4),
        },
        government: gov,
      },
      "Profile retrieved",
    );
  } catch (e) {
    console.error("[ess/profile]", e);
    return serverError(e);
  }
}
