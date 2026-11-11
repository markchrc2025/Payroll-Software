/**
 * prismaAdmin: a SEPARATE Prisma client that connects as the database OWNER
 * role (DIRECT_DATABASE_URL). The owner is not a superuser and does not hold
 * BYPASSRLS; it sees every tenant because each RLS table carries an
 * `admin_bypass` policy `TO <owner> USING (true)` (z2_admin_bypassrls, and
 * 20261110000100_rls_catalogue_completion for tables created after it).
 *
 * Use ONLY for inherently cross-tenant operations:
 *   • Credentials login lookup by email (we don't know tenantId yet)
 *   • SUPER_ADMIN tenant management screens
 *   • Background jobs that legitimately need to span tenants
 *
 * For every normal request, use the tenant-scoped `prisma` client wrapped in
 * `withTenant(tenantId, ...)` from src/lib/with-tenant.ts. That client connects
 * as payroll_app, which RLS constrains (unit 0.7).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { adminDatabaseUrl, lazyClient } from "./db-urls";

function createPrismaAdmin() {
  // Unit 0.7: DIRECT_DATABASE_URL ONLY. Falling back to DATABASE_URL would
  // connect as payroll_app, and cross-tenant lookups would return EMPTY
  // instead of failing (every credentials login: "invalid credentials").
  const connectionString = adminDatabaseUrl();
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

declare global {
  var prismaAdminGlobal: undefined | ReturnType<typeof createPrismaAdmin>;
}

let instance: ReturnType<typeof createPrismaAdmin> | undefined;

function getPrismaAdmin(): ReturnType<typeof createPrismaAdmin> {
  instance ??= globalThis.prismaAdminGlobal ?? createPrismaAdmin();
  if (process.env.NODE_ENV !== "production") {
    globalThis.prismaAdminGlobal = instance;
  }
  return instance;
}

// Constructed on first use: a missing DIRECT_DATABASE_URL throws at the first
// query, not at import (so `next build` needs no database credentials).
const prismaAdmin: ReturnType<typeof createPrismaAdmin> = lazyClient(getPrismaAdmin);

export default prismaAdmin;
