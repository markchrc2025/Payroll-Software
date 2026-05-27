/**
 * prismaAdmin — a SEPARATE Prisma client that connects with the database
 * owner role (DIRECT_DATABASE_URL = payroll_user), which is the bootstrap
 * superuser and therefore BYPASSES RLS.
 *
 * Use ONLY for inherently cross-tenant operations:
 *   • Credentials login lookup by email (we don't know tenantId yet)
 *   • SUPER_ADMIN tenant management screens
 *   • Background jobs that legitimately need to span tenants
 *
 * For every normal request, use the tenant-scoped `prisma` client wrapped in
 * `withTenant(tenantId, ...)` from src/lib/with-tenant.ts.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaAdmin() {
  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var prismaAdminGlobal: undefined | ReturnType<typeof createPrismaAdmin>;
}

const prismaAdmin =
  globalThis.prismaAdminGlobal ?? createPrismaAdmin();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaAdminGlobal = prismaAdmin;
}

export default prismaAdmin;
