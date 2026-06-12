/**
 * POST /api/ess/webauthn/authenticate/finish
 *
 * Verifies the WebAuthn assertion, updates the credential counter, and issues
 * an ESS session token.
 *
 * Body: { challengeToken: string, response: AuthenticationResponseJSON }
 */
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { VerifyAuthenticationResponseOpts } from "@simplewebauthn/server";
type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts["response"];
type AuthenticatorDevice = VerifyAuthenticationResponseOpts["authenticator"];
import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyChallenge } from "@/lib/webauthn-challenge";
import { createEssSession } from "@/lib/ess-auth";
import { ok, err, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
function expectedOrigins(): string[] {
  const env = process.env.WEBAUTHN_ORIGIN;
  if (env) return env.split(",").map((s) => s.trim());
  return ["http://localhost:3000", "https://localhost:3000"];
}

const bodySchema = z.object({
  challengeToken: z.string().min(1),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { challengeToken, response: credResponse } = parsed.data;

  let employeeId: string;
  let tenantId: string;
  let challenge: string;
  try {
    const payload = verifyChallenge(challengeToken);
    employeeId = payload.employeeId;
    tenantId = payload.tenantId;
    challenge = payload.challenge;
  } catch (e) {
    return err(e instanceof Error ? e.message : "Invalid challenge", 400);
  }

  const credId = (credResponse as { id?: string }).id;
  if (!credId) return err("Missing credential ID", 400);

  try {
    const stored = await prismaAdmin.essWebAuthnCredential.findFirst({
      where: { credentialId: credId, employeeId, tenantId },
    });
    if (!stored) return err("Credential not found", 404);

    const authenticator: AuthenticatorDevice = {
      credentialID: Uint8Array.from(Buffer.from(stored.credentialId, "base64url")),
      credentialPublicKey: Uint8Array.from(Buffer.from(stored.publicKey, "base64url")),
      counter: Number(stored.counter),
    };

    const verification = await verifyAuthenticationResponse({
      response: credResponse as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedRPID: RP_ID,
      expectedOrigin: expectedOrigins(),
      requireUserVerification: false,
      authenticator,
    });

    if (!verification.verified) {
      return err("Biometric verification failed", 401);
    }

    await prismaAdmin.essWebAuthnCredential.update({
      where: { credentialId: credId },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    const rawToken = await createEssSession(tenantId, employeeId);
    return ok({ token: rawToken });
  } catch (e) {
    console.error("[ess/webauthn/authenticate/finish]", e);
    return serverError(e);
  }
}
