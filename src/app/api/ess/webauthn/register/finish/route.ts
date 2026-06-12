/**
 * POST /api/ess/webauthn/register/finish
 *
 * Verifies a WebAuthn registration response and stores the credential.
 * Body: { challengeToken: string, response: RegistrationResponseJSON, label?: string }
 */
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { VerifyRegistrationResponseOpts } from "@simplewebauthn/server";
type RegistrationResponseJSON = VerifyRegistrationResponseOpts["response"];
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { verifyChallenge } from "@/lib/webauthn-challenge";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { randomBytes } from "crypto";

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
function expectedOrigins(): string[] {
  const env = process.env.WEBAUTHN_ORIGIN;
  if (env) return env.split(",").map((s) => s.trim());
  return ["http://localhost:3000", "https://localhost:3000"];
}

const bodySchema = z.object({
  challengeToken: z.string().min(1),
  label: z.string().max(80).optional(),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { challengeToken, label, response: credResponse } = parsed.data;

  let challenge: string;
  try {
    const payload = verifyChallenge(challengeToken);
    if (payload.employeeId !== ctx.employeeId || payload.tenantId !== ctx.tenantId) {
      return err("Challenge mismatch", 403);
    }
    challenge = payload.challenge;
  } catch (e) {
    return err(e instanceof Error ? e.message : "Invalid challenge", 400);
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credResponse as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedRPID: RP_ID,
      expectedOrigin: expectedOrigins(),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return err("Registration verification failed", 400);
    }

    const { credentialID, credentialPublicKey, counter, aaguid } =
      verification.registrationInfo;

    const credentialIdB64 = Buffer.from(credentialID).toString("base64url");
    const publicKeyB64 = Buffer.from(credentialPublicKey).toString("base64url");

    await prismaAdmin.essWebAuthnCredential.create({
      data: {
        id: randomBytes(12).toString("hex"),
        tenantId: ctx.tenantId,
        employeeId: ctx.employeeId,
        credentialId: credentialIdB64,
        publicKey: publicKeyB64,
        counter: BigInt(counter),
        aaguid: aaguid ?? null,
        label: label ?? null,
      },
    });

    return ok({ verified: true }, "Biometric credential registered");
  } catch (e) {
    console.error("[ess/webauthn/register/finish]", e);
    return serverError(e);
  }
}
