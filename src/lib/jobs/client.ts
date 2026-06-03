/**
 * pg-boss singleton — one instance shared across all modules in the same
 * Node.js process.  Use `getJobQueue()` everywhere; never construct PgBoss
 * directly outside this file.
 *
 * Requires the DIRECT_DATABASE_URL env var (raw PostgreSQL connection, not
 * a pooler) because pg-boss uses LISTEN/NOTIFY under the hood.
 */

import { PgBoss } from "pg-boss";

type Boss = InstanceType<typeof PgBoss>;

let _boss: Boss | null = null;
let _started = false;

export function getJobQueue(): Boss {
  if (!_boss) {
    const connString =
      process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connString) {
      throw new Error(
        "DIRECT_DATABASE_URL (or DATABASE_URL) must be set to initialise the job queue.",
      );
    }
    _boss = new PgBoss({
      connectionString: connString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _boss;
}

/**
 * Start pg-boss if not already started.  Idempotent — safe to call multiple
 * times (subsequent calls are no-ops).
 */
export async function startJobQueue(): Promise<Boss> {
  const boss = getJobQueue();
  if (!_started) {
    await boss.start();
    _started = true;
  }
  return boss;
}
