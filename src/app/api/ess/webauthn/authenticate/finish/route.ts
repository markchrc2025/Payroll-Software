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
import { activateInvitedEssAccount, evaluateEssAccess } from "@/lib/ess-access-gate";
import { createEssSession } from "@/lib/ess-auth";
import { captureError } from "@/lib/observability";
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

    // ---------------------------------------------------------------------
    // ACCESS GATE (unit 0.14).
    //
    // Possession of the passkey proves WHO this is. It says nothing about
    // whether they may still sign in — and this path previously asked only the
    // first question, so a terminated or disabled employee holding a passkey
    // registered before offboarding kept full ESS access indefinitely.
    //
    // Placed AFTER the assertion verifies and BEFORE both the counter write and
    // the session mint:
    //   • before the mint  — obviously; no session may be issued.
    //   • before the counter — a refused sign-in must not advance the replay
    //     guard on a credential we are not honouring.
    //   • after the assertion — refusing earlier would tell anyone holding only
    //     a company code and employee number that a given person has been
    //     terminated. Making them prove possession first keeps employment
    //     status behind the passkey.
    // ---------------------------------------------------------------------
    const emp = await prismaAdmin.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        deletedAt: true,
        employmentStatus: true,
        essAccessStatus: true,
        essDeactivateAt: true,
      },
    });

    const access = evaluateEssAccess(emp);
    if (!access.allowed) {
      // Identity is PROVEN here — someone holding this employee's passkey was
      // refused. That is a security-relevant event, not a routine 401, so it
      // alerts rather than merely logging. (The credential path logs without
      // alerting, because its gate runs before any credential is checked and a
      // refusal there identifies nobody.)
      await captureError(
        new Error(`ESS passkey sign-in refused: ${access.reason}`),
        {
          scope: "ess/webauthn:refused",
          critical: true,
          reason: access.reason,
          tenantId,
          employeeId,
        },
      );
      return err(access.message, access.status);
    }

    // The counter is the WebAuthn replay guard, NOT bookkeeping — unit 0.10's
    // fail-soft treatment must never be applied here. If it cannot be advanced
    // we do not know a replayed assertion would be caught next time, so the
    // login fails.
    await prismaAdmin.essWebAuthnCredential.update({
      where: { credentialId: credId },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    // A passkey sign-in is a successful first sign-in like any other, so it
    // activates an INVITED employee exactly as the credential path does.
    // Without this the two paths disagree about what a sign-in means: an
    // employee whose only credential is a passkey would sign in indefinitely
    // while HR's ESS portal showed them as "Invited" forever.
    //
    // Reachable despite registration requiring a session: HR disabling and
    // later re-granting access sets INVITED again, and nothing deletes the
    // passkey they registered while ACTIVE.
    if (access.needsActivation) {
      try {
        await activateInvitedEssAccount(employeeId);
      } catch (e) {
        await captureError(e, {
          scope: "ess/webauthn:activation",
          critical: true,
          tenantId,
          employeeId,
        });
        return serverError(e);
      }
    }

    const rawToken = await createEssSession(tenantId, employeeId);
    return ok({ token: rawToken });
  } catch (e) {
    console.error("[ess/webauthn/authenticate/finish]", e);
    return serverError(e);
  }
}
