/**
 * ESS wrong-attempt lockout (unit 0.15 Amendment 3, Mark's ruling of 10 Nov).
 *
 * A 6-digit PIN against a known employee number is only safe if guessing is
 * capped. Five wrong PINs or passwords in a row lock ESS sign-in for 15
 * minutes. The lock lifts by itself, or at once when the employee uses a reset
 * link (Forgot PIN). A success clears the count.
 *
 * The count moves in ONE statement (increment, and lock on the fifth), so two
 * wrong attempts racing each other cannot both slip under the limit.
 */
import type { Prisma } from "@prisma/client";
import type prismaAdmin from "@/lib/prisma-admin";

export const ESS_MAX_FAILED_ATTEMPTS = 5;
export const ESS_LOCK_MS = 15 * 60 * 1000;

type Db = typeof prismaAdmin | Prisma.TransactionClient;

/**
 * Timestamps are written and read in UTC inside SQL (`AT TIME ZONE 'UTC'`,
 * `EXTRACT(EPOCH ...)`), so the server's TZ (Asia/Manila) and the database
 * session's timezone can never shift a lock by eight hours.
 */
const msOf = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** When the account is locked until, or null when it is not locked now. */
export async function essLockedUntil(db: Db, employeeId: string, now = new Date()): Promise<Date | null> {
  const rows = await db.$queryRaw<Array<{ ms: number | null }>>`
    SELECT (EXTRACT(EPOCH FROM "essLockedUntil") * 1000)::float8 AS ms FROM "Employee" WHERE id = ${employeeId} LIMIT 1
  `;
  const ms = msOf(rows[0]?.ms);
  return ms !== null && ms > now.getTime() ? new Date(ms) : null;
}

/**
 * Count one wrong PIN or password. On the fifth in a row the account locks for
 * ESS_LOCK_MS and the count starts again. Returns the lock time if this
 * attempt locked it.
 */
export async function recordEssFailure(db: Db, employeeId: string, now = new Date()): Promise<Date | null> {
  const lockUntil = new Date(now.getTime() + ESS_LOCK_MS).toISOString();
  const rows = await db.$queryRaw<Array<{ ms: number | null; locked: boolean }>>`
    UPDATE "Employee"
       SET "essFailedAttempts" = CASE WHEN "essFailedAttempts" + 1 >= ${ESS_MAX_FAILED_ATTEMPTS} THEN 0 ELSE "essFailedAttempts" + 1 END,
           "essLockedUntil"    = CASE WHEN "essFailedAttempts" + 1 >= ${ESS_MAX_FAILED_ATTEMPTS}
                                      THEN (${lockUntil}::timestamptz AT TIME ZONE 'UTC') ELSE "essLockedUntil" END
     WHERE id = ${employeeId}
 RETURNING (EXTRACT(EPOCH FROM "essLockedUntil") * 1000)::float8 AS ms, ("essFailedAttempts" = 0) AS locked
  `;
  const row = rows[0];
  const ms = msOf(row?.ms);
  return row?.locked && ms !== null ? new Date(ms) : null;
}

/** Clear the count and any lock (a success, an invitation, a reset link). */
export async function clearEssFailures(db: Db, employeeId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "Employee" SET "essFailedAttempts" = 0, "essLockedUntil" = NULL
     WHERE id = ${employeeId} AND ("essFailedAttempts" <> 0 OR "essLockedUntil" IS NOT NULL)
  `;
}

/** The words shown when sign-in is locked. */
export function lockedMessage(until: Date, now = new Date()): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
  return `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or use Forgot PIN to unlock now.`;
}
