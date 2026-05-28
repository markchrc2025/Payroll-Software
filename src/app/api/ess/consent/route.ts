/**
 * GET  /api/ess/consent  — list the employee's current consent records
 * POST /api/ess/consent  — grant or revoke a consent type
 *
 * Auth:  ESS Bearer token (getEssContext)
 *
 * POST body:
 *   {
 *     type:          ConsentType,   // "BIOMETRIC_SELFIE" | "GEOLOCATION" | ...
 *     granted:       boolean,
 *     policyVersion: string,        // e.g. "v2026-01"
 *   }
 *
 * Revoking consent sets revokedAt on the most recent granted record.
 * DPA 10173 (Section 1.4) — consent is granular per type and versioned.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";

const CONSENT_TYPES = [
  "BIOMETRIC_SELFIE",
  "GEOLOCATION",
  "KIOSK_PHOTO",
  "DATA_PROCESSING",
  "MARKETING",
] as const;

const grantSchema = z.object({
  type:          z.enum(CONSENT_TYPES),
  granted:       z.boolean(),
  policyVersion: z.string().min(1).max(50),
});

export async function GET(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const records = await withTenant(ess.tenantId, (tx) =>
    tx.consentRecord.findMany({
      where: {
        tenantId:   ess.tenantId,
        employeeId: ess.employeeId,
      },
      orderBy: { grantedAt: "desc" },
      select: {
        id:            true,
        type:          true,
        granted:       true,
        policyVersion: true,
        grantedAt:     true,
        revokedAt:     true,
      },
    }),
  );

  return ok(records);
}

export async function POST(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(ess.tenantId, async (tx) => {
    if (!d.granted) {
      // Revoke: set revokedAt on the most recent active grant
      const existing = await tx.consentRecord.findFirst({
        where: {
          tenantId:   ess.tenantId,
          employeeId: ess.employeeId,
          type:       d.type,
          granted:    true,
          revokedAt:  null,
        },
        orderBy: { grantedAt: "desc" },
        select: { id: true },
      });
      if (!existing) return { action: "NO_ACTIVE_GRANT" as const };

      const updated = await tx.consentRecord.update({
        where: { id: existing.id },
        data:  { revokedAt: new Date() },
        select: { id: true, type: true, revokedAt: true },
      });
      return { action: "REVOKED" as const, record: updated };
    }

    // Grant: create a new consent record
    const record = await tx.consentRecord.create({
      data: {
        tenantId:      ess.tenantId,
        employeeId:    ess.employeeId,
        type:          d.type,
        granted:       true,
        policyVersion: d.policyVersion,
        ipAddress:     req.headers.get("x-forwarded-for") ?? undefined,
        userAgent:     req.headers.get("user-agent") ?? undefined,
      },
      select: { id: true, type: true, granted: true, policyVersion: true, grantedAt: true },
    });
    return { action: "GRANTED" as const, record };
  });

  if (result.action === "NO_ACTIVE_GRANT") {
    return err("No active consent record found to revoke", 404);
  }

  return ok(result.record, result.action === "GRANTED" ? "Consent granted" : "Consent revoked", 201);
}
