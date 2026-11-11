/**
 * Proof that the person holding an ESS session knows the account's current
 * credential, before a PIN or password change (unit 0.15 Amendments 1 and 3).
 *
 * A stolen session alone must not be able to change the PIN or add a password
 * and lock the owner out. Either current credential counts: the PIN (every
 * active account has one) or the password (if the employee set one). Wrong
 * answers count toward the same 5-attempt lock as sign-in, so a stolen
 * session cannot be used to guess the PIN either.
 */
import type { Prisma } from "@prisma/client";
import { verifyEssPassword, verifyEssPin } from "@/lib/ess-auth";
import { essLockedUntil, lockedMessage, recordEssFailure } from "@/lib/ess-lockout";

export type CurrentCheck = { ok: true } | { ok: false; status: 400 | 423; message: string };

export async function checkCurrentEssCredential(
  tx: Prisma.TransactionClient,
  employeeId: string,
  current: string,
): Promise<CurrentCheck> {
  const locked = await essLockedUntil(tx, employeeId);
  if (locked) return { ok: false, status: 423, message: lockedMessage(locked) };

  const emp = await tx.employee.findFirst({
    where: { id: employeeId },
    select: { essPin: true, essPasswordHash: true },
  });
  let good = false;
  if (current && emp?.essPin && /^\d{6}$/.test(current)) good = await verifyEssPin(current, emp.essPin);
  if (!good && current && emp?.essPasswordHash) good = await verifyEssPassword(current, emp.essPasswordHash);
  if (good) return { ok: true };

  const lockedNow = await recordEssFailure(tx, employeeId);
  if (lockedNow) return { ok: false, status: 423, message: lockedMessage(lockedNow) };
  return { ok: false, status: 400, message: "Your current PIN or password is incorrect." };
}
