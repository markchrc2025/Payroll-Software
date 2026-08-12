/**
 * ESS access gate (unit 0.14) — the SINGLE place that decides whether an
 * employee may hold an ESS session.
 *
 * WHY THIS FILE EXISTS
 *   These checks used to live inline in `/api/ess/auth`. `/api/ess/webauthn/
 *   authenticate/finish` is a second, fully independent sign-in that mints the
 *   same `EssSession` through the same `createEssSession` — and it enforced
 *   NONE of them. A terminated or disabled employee holding a passkey
 *   registered before offboarding could still sign in and read their payroll
 *   data. The hourly `ess.deactivation` sweep was no mitigation: it writes
 *   `essAccessStatus: DISABLED`, a field that path never read.
 *
 *   The fix is deliberately NOT four checks copied into a second file. The two
 *   paths diverged BECAUSE the gates lived inline in one of them, and a copy
 *   guarantees the third path diverges the same way. There is one
 *   implementation here; every sign-in path calls it.
 *
 * ADDING A NEW ESS SIGN-IN PATH
 *   Call `evaluateEssAccess` before minting anything, and honour
 *   `needsActivation`. Do not re-implement any of this inline.
 *
 * NOT AN AUTHENTICATION CHECK. This answers "may this employee hold a
 * session?", never "is this really them?". Callers prove identity themselves —
 * password/PIN/birth date on the credential path, a WebAuthn assertion on the
 * passkey path — and the two questions must stay separate.
 */

import prismaAdmin from "@/lib/prisma-admin";

/** Employment states that end ESS access outright. */
export const ENDED_EMPLOYMENT_STATUSES = ["RESIGNED", "TERMINATED", "RETIRED"] as const;

/**
 * The employee fields the gate reads. Every sign-in path must select all of
 * them — a path that selects fewer silently loses a gate, which is the exact
 * failure this module exists to prevent.
 */
export type EssAccessSubject = {
  deletedAt: Date | null;
  employmentStatus: string;
  essAccessStatus: string;
  essDeactivateAt: Date | null;
};

export type EssRefusalReason =
  | "unknown_employee"
  | "deleted"
  | "employment_ended"
  | "access_not_enabled"
  | "access_ended";

export type EssAccessDecision =
  | {
      allowed: true;
      /** essAccessStatus is INVITED — a successful sign-in must activate them. */
      needsActivation: boolean;
    }
  | {
      allowed: false;
      reason: EssRefusalReason;
      /** HTTP status the caller should answer with. */
      status: number;
      /** User-facing copy. Identical across paths so the product reads the same. */
      message: string;
    };

/**
 * Decide whether `emp` may hold an ESS session.
 *
 * Pure and synchronous — `now` is injectable so the `essDeactivateAt` boundary
 * is testable without clock games.
 *
 * Order is deliberate and mirrors the credential path exactly: existence, then
 * soft-delete, then employment, then ESS grant, then scheduled deactivation.
 * A soft-deleted or unknown employee is answered with the SAME "Invalid
 * credentials" 401 a wrong password gets, so the endpoint cannot be used to
 * enumerate who works here.
 */
export function evaluateEssAccess(
  emp: EssAccessSubject | null | undefined,
  now: Date = new Date(),
): EssAccessDecision {
  if (!emp) {
    return {
      allowed: false,
      reason: "unknown_employee",
      status: 401,
      message: "Invalid credentials",
    };
  }

  if (emp.deletedAt !== null) {
    return {
      allowed: false,
      reason: "deleted",
      status: 401,
      message: "Invalid credentials",
    };
  }

  if ((ENDED_EMPLOYMENT_STATUSES as readonly string[]).includes(emp.employmentStatus)) {
    return {
      allowed: false,
      reason: "employment_ended",
      status: 403,
      message: "Access denied — inactive employee",
    };
  }

  // Employees do NOT have ESS access by default; HR must grant it.
  if (emp.essAccessStatus === "NOT_INVITED" || emp.essAccessStatus === "DISABLED") {
    return {
      allowed: false,
      reason: "access_not_enabled",
      status: 403,
      message:
        "Employee Self-Service access isn't enabled for your account — please contact HR.",
    };
  }

  // A scheduled deactivation is authoritative the moment it passes, even if the
  // hourly sweep hasn't run yet.
  if (emp.essDeactivateAt && emp.essDeactivateAt.getTime() <= now.getTime()) {
    return {
      allowed: false,
      reason: "access_ended",
      status: 403,
      message: "Your Employee Self-Service access has ended — please contact HR.",
    };
  }

  return { allowed: true, needsActivation: emp.essAccessStatus === "INVITED" };
}

/**
 * Flip an INVITED employee to ACTIVE. Shared for the same reason the gate is:
 * the credential path activated on first sign-in and the passkey path did not,
 * so an employee could sign in by passkey forever and stay INVITED in HR's
 * portal.
 *
 * Deliberately NOT wrapped. Per unit 0.10 this is account state, not
 * bookkeeping: it must fail the login rather than leave someone holding a
 * session for an account that never activated — a state that is permanent,
 * because every later sign-in re-attempts the same failing write.
 */
export async function activateInvitedEssAccount(employeeId: string): Promise<void> {
  await prismaAdmin.employee.update({
    where: { id: employeeId },
    data: { essAccessStatus: "ACTIVE", essActivatedAt: new Date() },
  });
}
