/**
 * GET /api/ess/webauthn/credentials
 *
 * List the employee's registered WebAuthn credentials.
 * Returns: { data: Credential[] }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  try {
    const creds = await prismaAdmin.essWebAuthnCredential.findMany({
      where: { employeeId: ctx.employeeId, tenantId: ctx.tenantId },
      select: {
        id: true,
        label: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return ok(creds);
  } catch (e) {
    console.error("[ess/webauthn/credentials GET]", e);
    return serverError(e);
  }
}
