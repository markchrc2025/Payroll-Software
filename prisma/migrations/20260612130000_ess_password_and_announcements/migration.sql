-- ESS phase 2 + 4: optional employee ESS password and company announcements.
-- Additive only — safe to run on a live database.

-- Employee: optional ESS password (bcrypt), set by the employee themselves.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "essPasswordHash" TEXT;

-- Company-wide announcements surfaced in the ESS app.
CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Announcement_tenantId_isPublished_publishedAt_idx"
    ON "Announcement" ("tenantId", "isPublished", "publishedAt");
CREATE INDEX IF NOT EXISTS "Announcement_deletedAt_idx"
    ON "Announcement" ("deletedAt");

DO $$ BEGIN
    ALTER TABLE "Announcement"
        ADD CONSTRAINT "Announcement_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Row-level security: announcements are tenant-scoped like the rest of the schema.
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "tenant_isolation" ON "Announcement"
        USING ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
