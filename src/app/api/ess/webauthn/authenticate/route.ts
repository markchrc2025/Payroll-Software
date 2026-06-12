/**
 * POST /api/ess/webauthn/authenticate/start
 *
 * Given { companyCode, employeeNumber }, returns WebAuthn authentication
 * options and a signed challenge token. No ESS auth required.
 */
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { issueChallenge } from "@/lib/webauthn-challenge";
import { ok, err, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";

const bodySchema = z.object({
  companyCode: z.string().min(1).toUpperCase(),
  employeeNumber: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { companyCode, employeeNumber } = parsed.data;

  try {
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { companyCode, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) return err("Unknown company code", 404);

    const employee = await prismaAdmin.employee.findFirst({
      where: {
        tenantId: tenant.id,
        employeeNumber: { equals: employeeNumber, mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!employee) return err("Employee not found", 404);

    const credentials = await prismaAdmin.essWebAuthnCredential.findMany({
      where: { employeeId: employee.id, tenantId: tenant.id },
      select: { credentialId: true },
    });

    if (credentials.length === 0) {
      return err("No biometric credentials registered for this account", 404);
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
      allowCredentials: credentials.map((c) => ({
        id: Buffer.from(c.credentialId, "base64url"),
        type: "public-key" as const,
      })),
    });

    const challengeToken = issueChallenge(
      options.challenge,
      employee.id,
      tenant.id,
    );

    return ok({ options, challengeToken });
  } catch (e) {
    console.error("[ess/webauthn/authenticate POST]", e);
    return serverError(e);
  }
}
