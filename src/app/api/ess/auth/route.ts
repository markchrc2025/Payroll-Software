/**
 * POST /api/ess/auth
 *
 * Employee Self-Service login.  Authenticates an employee using:
 *   • employeeNumber + birthDate  (primary — no PIN required)
 *   • employeeNumber + pin        (if the employee has set an ESS PIN)
 *
 * On success: creates an EssSession and returns the raw token.
 * The client must include `Authorization: Bearer <token>` on subsequent ESS
 * requests.
 *
 * Body: { companyCode: string, employeeNumber: string, birthDate?: string (YYYY-MM-DD), pin?: string }
 *
 * Note: `companyCode` is required — employees use their company's short code
 * (e.g. "DEMOCORP") to identify their tenant. Resolved to the internal tenantId.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { activateInvitedEssAccount, evaluateEssAccess } from "@/lib/ess-access-gate";
import { createEssSession, verifyEssPin, verifyEssPassword } from "@/lib/ess-auth";
import { captureError } from "@/lib/observability";
import prismaAdmin from "@/lib/prisma-admin";

const LoginSchema = z
  .object({
    companyCode: z.string().min(1),
    employeeNumber: z.string().min(1),
    birthDate: z.string().optional(), // "YYYY-MM-DD"
    pin: z.string().min(4).max(8).optional(),
    password: z.string().min(1).optional(),
  })
  .refine((d) => d.birthDate !== undefined || d.pin !== undefined || d.password !== undefined, {
    message: "Provide a birthDate, pin or password",
  });

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

  const { companyCode, employeeNumber, birthDate, pin, password } = parsed.data;

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
        birthDate: Date | null;
        essPin: string | null;
        deletedAt: Date | null;
        employmentStatus: string;
        essAccessStatus: string;
        essDeactivateAt: Date | null;
      }>
    >`
      SELECT id, "birthDate", "essPin", "deletedAt", "employmentStatus",
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

    let authenticated = false;

    if (password !== undefined) {
      // Password-based auth. essPasswordHash may not exist yet (column added by
      // the ESS password migration) — query it defensively so PIN/DOB login keep
      // working before the migration is applied.
      let hash: string | null = null;
      try {
        const rows = await prismaAdmin.$queryRaw<Array<{ essPasswordHash: string | null }>>`
          SELECT "essPasswordHash" FROM "Employee" WHERE id = ${emp.id} LIMIT 1
        `;
        hash = rows[0]?.essPasswordHash ?? null;
      } catch {
        return err("Password sign-in isn't available yet — use your PIN or date of birth.", 400);
      }
      if (!hash) {
        return err("No ESS password set — sign in with your PIN or date of birth, then set one in Settings.", 400);
      }
      authenticated = await verifyEssPassword(password, hash);
    } else if (pin !== undefined) {
      // PIN-based auth
      if (!emp.essPin) {
        return err("No ESS PIN set — use birthdate login", 400);
      }
      authenticated = await verifyEssPin(pin, emp.essPin);
    } else if (birthDate !== undefined) {
      // Birthdate-based auth — compare UTC midnight
      if (!emp.birthDate) {
        return err("Birthdate not on record — contact HR", 400);
      }
      const storedDate = emp.birthDate.toISOString().split("T")[0]; // "YYYY-MM-DD"
      authenticated = storedDate === birthDate;
    }

    if (!authenticated) {
      return err("Invalid credentials", 401);
    }

    // ---------------------------------------------------------------------
    // Two writes, two opposite guarantees (unit 0.10).
    //
    // These used to be ONE `employee.update`, which forced a single failure
    // policy onto two things that need different ones. Unguarded, a blip on
    // either half fell through to the outer catch and returned 500 — a valid
    // credential denied. But wrapping the combined call in try/catch, the way
    // unit 0.3 guards the tenant `lastLoginAt`, would have been worse: an
    // INVITED employee could be handed a session while their activation
    // silently never happened, leaving them logged in and stuck at INVITED
    // forever, with no error anywhere. Splitting is what lets each half get
    // the policy it actually needs.
    // ---------------------------------------------------------------------

    // 1. ACTIVATION — account state, not bookkeeping. This is the record that
    //    the invitation was accepted, and everything downstream (HR's ESS
    //    portal, the deactivation sweep, reporting) reads it. It goes FIRST and
    //    it MUST fail the login: better to deny a login that can be retried
    //    than to issue a session for an account that never activated.
    if (access.needsActivation) {
      try {
        await activateInvitedEssAccount(emp.id);
      } catch (e) {
        await captureError(e, {
          scope: "ess/auth:activation",
          critical: true,
          tenantId,
          employeeId: emp.id,
        });
        return serverError(e);
      }
    }

    // 2. BOOKKEEPING — `essLastLoginAt` records when someone last signed in and
    //    says nothing about whether they may. Best-effort, same as unit 0.3:
    //    fail soft, but report it — swallowing this would trade a visible
    //    failure for an invisible one. A lost timestamp is not worth a denied
    //    login.
    try {
      await prismaAdmin.employee.update({
        where: { id: emp.id },
        data: { essLastLoginAt: new Date() },
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
