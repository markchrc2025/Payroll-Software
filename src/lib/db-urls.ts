/**
 * Unit 0.7: which connection string each database client uses.
 *
 * One place, and NO fallbacks between the two. The two roles are not
 * interchangeable, and each wrong substitution fails silently:
 *
 *   DATABASE_URL        -> payroll_app, the role RLS constrains. The runtime
 *                          client (src/lib/prisma.ts, used only by withTenant).
 *                          Falling back to the owner made RLS isolate nothing:
 *                          admin_bypass lets the owner see every tenant (#214).
 *   DIRECT_DATABASE_URL -> the owner. prismaAdmin, the job queue, migrations.
 *                          Falling back to payroll_app makes cross-tenant
 *                          lookups return EMPTY instead of failing: every
 *                          credentials login would read as "invalid
 *                          credentials", with no diagnostic.
 *
 * Both throw when unset. They are called lazily (on first query), never at
 * import, so `next build` does not need database credentials.
 */

export function runtimeDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The runtime client connects ONLY as the RLS-constrained " +
        "app role (payroll_app) and never falls back to DIRECT_DATABASE_URL (unit 0.7).",
    );
  }
  return url;
}

export function adminDatabaseUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) {
    throw new Error(
      "DIRECT_DATABASE_URL is not set. prismaAdmin and the job queue connect ONLY as the " +
        "owner role and never fall back to DATABASE_URL (unit 0.7).",
    );
  }
  return url;
}

/**
 * A stand-in for a client that is only constructed on first use. Every
 * property read is forwarded to the real instance; methods are bound to it.
 */
export function lazyClient<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = get();
      const value = Reflect.get(real, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    has(_target, prop) {
      return prop in get();
    },
  });
}
