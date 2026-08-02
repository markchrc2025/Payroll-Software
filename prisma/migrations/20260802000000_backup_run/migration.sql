-- BackupRun — heartbeat + audit trail for the off-platform database backup.
--
-- Deliberately a GLOBAL ops table: NO "tenantId" and NO row-level-security
-- policy. It stores only timestamps, the dump's object key, byte size, and
-- three sanity row-counts — never tenant PII. Written by the GitHub Actions
-- backup runner (owner role); read by /api/health via the admin (owner) client
-- for a best-effort freshness signal. Because only the owner role touches it,
-- no grant to the app role (payroll_app) is needed and no existing RLS policy
-- or role is altered by this migration.
--
-- Hand-written + idempotent (safe to re-run).

-- CreateTable
CREATE TABLE IF NOT EXISTS "BackupRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "employeeCount" INTEGER,
    "payrollSheetCount" INTEGER,
    "invoiceCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BackupRun_finishedAt_idx" ON "BackupRun"("finishedAt");
