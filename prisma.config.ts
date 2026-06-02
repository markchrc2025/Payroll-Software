import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Runtime (RLS-enforced): connects as payroll_app, non-superuser.
    // Migrations (DIRECT_DATABASE_URL): payroll_user (owner, bypasses RLS).
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
