import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenantId = "cmpnn0rrj0000yi73i6fcm5ih";
  const hash = await bcrypt.hash("Test1234!", 10);
  for (const email of ["manager@democorp.ph", "hrlead@democorp.ph"]) {
    const existing = await prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
    if (existing) {
      console.log(`exists: ${email} -> ${existing.id}`);
      continue;
    }
    const u = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: hash,
        firstName: email.split("@")[0],
        lastName: "Tester",
        systemRole: "TENANT_USER",
      },
    });
    console.log(`created: ${email} -> ${u.id}`);
  }
  await prisma.$disconnect();
  await pool.end();
}

main();
