/**
 * POST /api/ess/webauthn/register/start
 *
 * Requires ESS Bearer session. Returns registration options + a signed
 * challenge token for the client to echo back in /register/finish.
 */
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { issueChallenge } from "@/lib/webauthn-challenge";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Sentire Payroll ESS";
const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  try {
    const existing = await prismaAdmin.essWebAuthnCredential.findMany({
      where: { employeeId: ctx.employeeId, tenantId: ctx.tenantId },
      select: { credentialId: true },
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: ctx.employeeId,
      userName: ctx.employeeId,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: Buffer.from(c.credentialId, "base64url"),
        type: "public-key" as const,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const challengeToken = issueChallenge(
      options.challenge,
      ctx.employeeId,
      ctx.tenantId,
    );

    return ok({ options, challengeToken });
  } catch (e) {
    console.error("[ess/webauthn/register POST]", e);
    return serverError(e);
  }
}
