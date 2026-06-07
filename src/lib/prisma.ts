/**
 * Prisma Client Singleton — Sentire Payroll
 *
 * Adds field-level encryption (AES-256-GCM) on top of the base pg-adapter
 * client. Transparently encrypts on write and decrypts on read for fields
 * listed in ENCRYPTED_FIELDS.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt, decrypt, ENCRYPTED_FIELDS, hmac, HMAC_COMPANIONS } from "./crypto";

function encryptArgs(model: string, data: unknown): unknown {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !data || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  for (const f of fields) {
    if (f in obj && typeof obj[f] === "string") {
      const plain = obj[f] as string;
      obj[f] = encrypt(plain);
      // Populate the HMAC companion field if one is registered
      const companionKey = `${model}.${f}`;
      const companionField = HMAC_COMPANIONS[companionKey];
      if (companionField) {
        obj[companionField] = hmac(plain);
      }
    }
  }
  return obj;
}

function decryptRow(model: string, row: unknown): unknown {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !row || typeof row !== "object") return row;
  const obj = row as Record<string, unknown>;
  for (const f of fields) {
    if (typeof obj[f] === "string") {
      try {
        obj[f] = decrypt(obj[f] as string);
      } catch {
        // Leave value as-is if decryption fails (e.g. legacy plaintext during rotation)
      }
    }
  }
  return obj;
}

function decryptResult(model: string, result: unknown): unknown {
  if (result == null) return result;
  if (Array.isArray(result)) return result.map((r) => decryptRow(model, r));
  return decryptRow(model, result);
}

function createPrismaClient() {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

  return base.$extends({
    name: "field-encryption",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (args.data) args.data = encryptArgs(model, args.data) as typeof args.data;
          const result = await query(args);
          return decryptResult(model, result);
        },
        async createMany({ model, args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) => encryptArgs(model, d)) as typeof args.data;
          } else if (args.data) {
            args.data = encryptArgs(model, args.data) as typeof args.data;
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (args.data) args.data = encryptArgs(model, args.data) as typeof args.data;
          const result = await query(args);
          return decryptResult(model, result);
        },
        async updateMany({ model, args, query }) {
          if (args.data) args.data = encryptArgs(model, args.data) as typeof args.data;
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (args.create) args.create = encryptArgs(model, args.create) as typeof args.create;
          if (args.update) args.update = encryptArgs(model, args.update) as typeof args.update;
          const result = await query(args);
          return decryptResult(model, result);
        },
        async findUnique({ model, args, query }) {
          const result = await query(args);
          return decryptResult(model, result);
        },
        async findUniqueOrThrow({ model, args, query }) {
          const result = await query(args);
          return decryptResult(model, result);
        },
        async findFirst({ model, args, query }) {
          const result = await query(args);
          return decryptResult(model, result);
        },
        async findFirstOrThrow({ model, args, query }) {
          const result = await query(args);
          return decryptResult(model, result);
        },
        async findMany({ model, args, query }) {
          const result = await query(args);
          return decryptResult(model, result);
        },
      },
    },
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
