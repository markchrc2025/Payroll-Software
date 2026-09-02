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
 * passkey path, a kiosk PIN at a kiosk — and the two questions must stay
 * separate.
 *
 * TWO LAYERS (unit 0.18). The checks are NOT all universal, so the ESS gate is
 * COMPOSED from a smaller one rather than applied wholesale:
 *
 *   evaluateEmploymentAccess  — deletedAt + employmentStatus. Universal: an
 *                               ex-employee may not transact with the system
 *                               on ANY surface.
 *   evaluateEssAccess         — the above PLUS essAccessStatus and
 *                               essDeactivateAt, which are ESS-specific.
 *
 * The distinction is load-bearing, not tidiness: an employee whose ESS access
 * is DISABLED is still employed and must still be able to clock in at a kiosk.
 * Applying the whole ESS gate to the kiosk would lock working staff out of the
 * time clock — a worse outage than the hole it closes.
 *
 * FILENAME. Historical: this module predates the split and is still imported as
 * `ess-access-gate` by unit 0.14's tests, which are a regression guard and must
 * not be edited. It hosts both layers.
 */

import prismaAdmin from "@/lib/prisma-admin";

/** Employment states that end ESS access outright. */
export const ENDED_EMPLOYMENT_STATUSES = ["RESIGNED", "TERMINATED", "RETIRED"] as const;

/**
 * The fields the UNIVERSAL gate reads. Any surface that authenticates an
 * employee must select both — a surface selecting fewer silently loses a gate,
 * which is the exact failure this module exists to prevent.
 */
export type EmploymentSubject = {
  deletedAt: Date | null;
  employmentStatus: string;
};

/**
 * The fields the ESS gate reads: the universal pair plus the ESS-specific pair.
 */
export type EssAccessSubject = EmploymentSubject & {
  essAccessStatus: string;
  essDeactivateAt: Date | null;
};

export type EssRefusalReason =
  | "unknown_employee"
  | "deleted"
  | "employment_ended"
  | "access_not_enabled"
  | "access_ended";

export type EmploymentDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "unknown_employee" | "deleted" | "employment_ended";
      status: number;
      message: string;
    };

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
 * The UNIVERSAL gate (unit 0.18): may this employee transact with the system at
 * all? Soft-delete and employment status only — nothing ESS-specific.
 *
 * Every employee-authenticating surface calls this, directly or through a
 * composed gate. `/api/kiosk/punch` checked `deletedAt` alone and never
 * `employmentStatus`, and because termination sets the status rather than
 * `deletedAt`, a terminated employee kept a working time clock: fabricated
 * attendance flowing into DTR and then into payroll.
 *
 * Returns the reason plus DEFAULT copy. Surfaces whose wording must differ
 * override it — the ESS gate does, because a sign-in endpoint answers unknown
 * and soft-deleted employees with the same "Invalid credentials" a wrong
 * password gets, so it cannot be used to enumerate who works here.
 */
export function evaluateEmploymentAccess(
  emp: EmploymentSubject | null | undefined,
): EmploymentDecision {
  if (!emp) {
    return {
      allowed: false,
      reason: "unknown_employee",
      status: 404,
      message: "Employee not found",
    };
  }

  if (emp.deletedAt !== null) {
    return {
      allowed: false,
      reason: "deleted",
      status: 404,
      message: "Employee not found",
    };
  }

  if ((ENDED_EMPLOYMENT_STATUSES as readonly string[]).includes(emp.employmentStatus)) {
    return {
      allowed: false,
      reason: "employment_ended",
      status: 403,
      message: "This employee is no longer active. Please contact HR.",
    };
  }

  return { allowed: true };
}

/** ESS-specific copy for the universal refusals — see the note above. */
const ESS_REFUSAL_COPY: Record<
  "unknown_employee" | "deleted" | "employment_ended",
  { status: number; message: string }
> = {
  unknown_employee: { status: 401, message: "Invalid credentials" },
  deleted: { status: 401, message: "Invalid credentials" },
  employment_ended: { status: 403, message: "Access denied — inactive employee" },
};

/**
 * Decide whether `emp` may hold an ESS session.
 *
 * COMPOSED: the universal gate first, then the two ESS-specific checks. Pure
 * and synchronous — `now` is injectable so the `essDeactivateAt` boundary is
 * testable without clock games.
 *
 * Order is deliberate and unchanged from unit 0.14: existence, then
 * soft-delete, then employment, then ESS grant, then scheduled deactivation.
 */
export function evaluateEssAccess(
  emp: EssAccessSubject | null | undefined,
  now: Date = new Date(),
): EssAccessDecision {
  const core = evaluateEmploymentAccess(emp);
  if (!core.allowed) {
    const copy = ESS_REFUSAL_COPY[core.reason];
    return { allowed: false, reason: core.reason, status: copy.status, message: copy.message };
  }

  // `core.allowed` is only true for a non-null subject.
  const subject = emp as EssAccessSubject;

  // Employees do NOT have ESS access by default; HR must grant it.
  if (subject.essAccessStatus === "NOT_INVITED" || subject.essAccessStatus === "DISABLED") {
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
  if (subject.essDeactivateAt && subject.essDeactivateAt.getTime() <= now.getTime()) {
    return {
      allowed: false,
      reason: "access_ended",
      status: 403,
      message: "Your Employee Self-Service access has ended — please contact HR.",
    };
  }

  return { allowed: true, needsActivation: subject.essAccessStatus === "INVITED" };
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
