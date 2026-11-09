/**
 * pg-boss singleton — one instance shared across all modules in the same
 * Node.js process.  Use `getJobQueue()` everywhere; never construct PgBoss
 * directly outside this file.
 *
 * Requires the DIRECT_DATABASE_URL env var (raw PostgreSQL connection, not
 * a pooler) because pg-boss uses LISTEN/NOTIFY under the hood.
 *
 * Role (unit 0.7, decision A3): the OWNER, explicitly, never payroll_app.
 * pg-boss creates and migrates its own `pgboss` schema on start (DDL), which
 * payroll_app cannot and should not be able to do. Job HANDLERS are a separate
 * question: they reach tenant data through withTenant (payroll_app) or
 * prismaAdmin like any other code; this connection only carries the queue.
 */

import { PgBoss } from "pg-boss";
import { adminDatabaseUrl } from "../db-urls";

type Boss = InstanceType<typeof PgBoss>;

let _boss: Boss | null = null;
let _started = false;

export function getJobQueue(): Boss {
  if (!_boss) {
    // Throws if DIRECT_DATABASE_URL is unset. No fallback to DATABASE_URL.
    const connString = adminDatabaseUrl();
    const config: ConstructorParameters<typeof PgBoss>[0] = {
      connectionString: connString,
      ssl: { rejectUnauthorized: false },
    };
    // pg-boss forwards this config straight to `new pg.Pool()`, so plain
    // node-postgres socket options work even though pg-boss's own types don't
    // declare them. Some managed Postgres hosts silently drop idle TCP
    // connections after ~60s; without a keepalive, pg-boss's next scheduled
    // tick hits a dead socket and errors instead of reconnecting.
    (config as Record<string, unknown>).keepAlive = true;
    (config as Record<string, unknown>).keepAliveInitialDelayMillis = 10000;
    _boss = new PgBoss(config);
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
