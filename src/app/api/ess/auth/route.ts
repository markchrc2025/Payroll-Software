/**
 * POST /api/ess/auth
 *
 * Employee Self-Service login: company code + employee number, then
 *   - the employee's 6-digit PIN (the default), or
 *   - their password, if they chose to set one after first sign-in.
 *
 * Unit 0.15 Amendment 3 (Mark's ruling of 10 Nov 2026):
 *   - birth-date sign-in is GONE. A birth date is known to co-workers, so it
 *     proved nothing;
 *   - signing in NEVER activates an account. An INVITED employee is told to
 *     open their invitation, which is where they choose their PIN (ruling B7:
 *     the invitation is the only way in);
 *   - five wrong PINs or passwords in a row lock sign-in for 15 minutes; Forgot
 *     PIN unlocks at once (src/lib/ess-lockout.ts).
 *
 * On success: creates an EssSession and returns the raw token. The client
 * sends `Authorization: Bearer <token>` on later ESS requests.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { evaluateEssAccess } from "@/lib/ess-access-gate";
import { createEssSession, verifyEssPin, verifyEssPassword } from "@/lib/ess-auth";
import { essLockedUntil, lockedMessage, recordEssFailure } from "@/lib/ess-lockout";
import { captureError } from "@/lib/observability";
import prismaAdmin from "@/lib/prisma-admin";

const LoginSchema = z
  .object({
    companyCode: z.string().min(1),
    employeeNumber: z.string().min(1),
    pin: z.string().regex(/^\d{6}$/, "Your PIN is 6 digits").optional(),
    password: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((d) => (d.pin === undefined) !== (d.password === undefined), {
    message: "Sign in with your PIN or your password",
  });

const INVITED_MESSAGE =
  "Your account isn't active yet. Open the invitation email from HR to set your PIN, or ask HR to resend it.";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { companyCode, employeeNumber, pin, password } = parsed.data;

  try {
    // Resolve companyCode → tenantId
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { companyCode: companyCode.trim().toUpperCase(), deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      return err("Invalid credentials", 401);
    }
    const tenantId = tenant.id;

    // Lookup employee using the admin client (BYPASSRLS) — scoped by tenantId
    const employee = await prismaAdmin.$queryRaw<
      Array<{
        id: string;
        essPin: string | null;
        essPasswordHash: string | null;
        deletedAt: Date | null;
        employmentStatus: string;
        essAccessStatus: string;
        essDeactivateAt: Date | null;
      }>
    >`
      SELECT id, "essPin", "essPasswordHash", "deletedAt", "employmentStatus",
             "essAccessStatus", "essDeactivateAt"
      FROM "Employee"
      WHERE "tenantId" = ${tenantId}
        AND "employeeNumber" = ${employeeNumber}
      LIMIT 1
    `;

    if (employee.length === 0) {
      return err("Invalid credentials", 401);
    }

    const emp = employee[0]!;

    // Access gate — soft-delete, employment status, ESS grant and scheduled
    // deactivation. Shared with the passkey sign-in (unit 0.14): these checks
    // used to live inline here, which is exactly why
    // /api/ess/webauthn/authenticate/finish drifted without any of them.
    //
    // This runs BEFORE the credential is verified, so a refusal here says
    // nothing about who was knocking — anyone can POST an employee number. It
    // is logged, never alerted; see the passkey path for the case where
    // identity is already proven.
    const access = evaluateEssAccess(emp);
    if (!access.allowed) {
      await captureError(new Error(`ESS sign-in refused: ${access.reason}`), {
        scope: "ess/auth:refused",
        reason: access.reason,
        tenantId,
        employeeId: emp.id,
      });
      return err(access.message, access.status);
    }

    // Sign-in never activates (ruling B7). The invitation is the only way in.
    if (access.needsActivation) return err(INVITED_MESSAGE, 403);

    const lockedUntil = await essLockedUntil(prismaAdmin, emp.id);
    if (lockedUntil) return err(lockedMessage(lockedUntil), 423);

    let authenticated = false;
    if (password !== undefined) {
      if (!emp.essPasswordHash) {
        return err("You haven't set a password. Sign in with your PIN.", 400);
      }
      authenticated = await verifyEssPassword(password, emp.essPasswordHash);
    } else if (pin !== undefined) {
      if (!emp.essPin) {
        return err("No PIN is set on this account. Use Forgot PIN, or ask HR to resend your invitation.", 400);
      }
      authenticated = await verifyEssPin(pin, emp.essPin);
    }

    if (!authenticated) {
      const lockedNow = await recordEssFailure(prismaAdmin, emp.id);
      if (lockedNow) return err(lockedMessage(lockedNow), 423);
      return err("Invalid credentials", 401);
    }

    // BOOKKEEPING: `essLastLoginAt`, and the wrong-attempt count back to zero.
    //    Best-effort, same as unit 0.3 and 0.10: fail soft, but report it. A
    //    lost timestamp is not worth a denied login.
    try {
      await prismaAdmin.employee.update({
        where: { id: emp.id },
        data: { essLastLoginAt: new Date(), essFailedAttempts: 0, essLockedUntil: null },
      });
    } catch (e) {
      await captureError(e, {
        scope: "ess/auth:lastLogin",
        tenantId,
        employeeId: emp.id,
      });
    }

    const rawToken = await createEssSession(tenantId, emp.id);
    return ok({ token: rawToken, employeeId: emp.id }, "Login successful");
  } catch (e) {
    console.error("[ess/auth]", e);
    return serverError(e);
  }
}
