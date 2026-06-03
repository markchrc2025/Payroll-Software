/**
 * create-super-admin.ts — one-time provisioning script for SUPER_ADMIN users.
 *
 * Run with:
 *   tsx scripts/create-super-admin.ts \
 *     --email=you@sentire.ph \
 *     --firstName=Mark \
 *     --lastName=Admin \
 *     --password=<strong-password>
 *
 * Uses DIRECT_DATABASE_URL (BYPASSRLS) so it can write a User row with
 * tenantId = NULL and systemRole = SUPER_ADMIN.
 *
 * Safe to re-run: prints a warning if the email already exists and exits.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const email = getArg("email");
const firstName = getArg("firstName");
const lastName = getArg("lastName");
const password = getArg("password");

if (!email || !firstName || !lastName || !password) {
  console.error(
    "Usage: tsx scripts/create-super-admin.ts " +
      "--email=<email> --firstName=<first> --lastName=<last> --password=<password>",
  );
  process.exit(1);
}

if (password.length < 10) {
  console.error("Password must be at least 10 characters for a SUPER_ADMIN account.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// DB connection (BYPASSRLS — same pattern as load-statutory-2026.ts)
// ---------------------------------------------------------------------------
const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const normalizedEmail = email!.toLowerCase().trim();

  // Guard: check for existing account
  const existing = await prisma.user.findFirst({
    where: { email: normalizedEmail, deletedAt: null },
    select: { id: true, systemRole: true },
  });

  if (existing) {
    if (existing.systemRole === "SUPER_ADMIN") {
      console.log(
        `\nAccount already exists as SUPER_ADMIN:\n  id    : ${existing.id}\n  email : ${normalizedEmail}\n\nNo changes made.`,
      );
    } else {
      console.warn(
        `\nA user with email "${normalizedEmail}" already exists with role "${existing.systemRole}".\n` +
          `If you want to promote them to SUPER_ADMIN, update systemRole manually via psql.\n`,
      );
    }
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password!, 12);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      firstName: firstName!.trim(),
      lastName: lastName!.trim(),
      passwordHash,
      systemRole: "SUPER_ADMIN",
      tenantId: null,
      isActive: true,
    },
    select: { id: true, email: true, firstName: true, lastName: true, systemRole: true },
  });

  console.log(
    `\nSUPER_ADMIN account created:\n  id    : ${user.id}\n  email : ${user.email}\n  name  : ${user.firstName} ${user.lastName}\n  role  : ${user.systemRole}\n\nSign in at /login and navigate to /portal/dashboard.\n`,
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
