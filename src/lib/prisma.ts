/**
 * Prisma Client Singleton
 *
 * Prisma 7 uses the "client" engine which requires a driver adapter.
 * We use @prisma/adapter-pg (pg Pool) for PostgreSQL.
 * A single Pool is shared to prevent exhausting connections during Next.js hot-reload.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof createPrismaClient>;
}

const prisma: ReturnType<typeof createPrismaClient> =
  globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
