import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Connection string for Prisma CLI commands (migrate, db, studio).
 *
 * Prisma migrations take a SESSION-scoped advisory lock. Supabase's TRANSACTION
 * pooler (port 6543) does not preserve session state across statements, so
 * `prisma migrate deploy` hangs forever on that lock — this is what made
 * Render's pre-deploy step time out. The SESSION pooler (port 5432) on the same
 * host works correctly. If the configured URL points at the Supabase
 * transaction pooler, coerce it to the session pooler so migrations always run
 * on a session-mode connection, regardless of how the env var is set.
 *
 * This affects ONLY the Prisma CLI. The runtime client (src/lib/prisma.ts)
 * reads its connection string straight from the environment and never imports
 * this file, so request-time queries keep using whatever pooler the env points
 * at (transaction mode is correct there).
 */
function migrationUrl(): string | undefined {
  const raw = process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") {
      u.port = "5432"; // transaction pooler → session pooler (migrations need session mode)
      return u.toString();
    }
  } catch {
    // Not a parseable URL — leave it untouched.
  }
  return raw;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Runtime (RLS-enforced): connects as payroll_app, non-superuser.
    // Migrations (DIRECT_DATABASE_URL): payroll_user (owner, bypasses RLS),
    // coerced onto the Supabase SESSION pooler when needed (see migrationUrl()).
    url: migrationUrl(),
  },
});
