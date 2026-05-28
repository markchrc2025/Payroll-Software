-- Phase Y — Attendance Log (kiosk / ESS clock-in pipeline)
-- Creates AttendanceLog table and two supporting enums.

-- 1. New enums
CREATE TYPE "PunchType"   AS ENUM ('IN', 'OUT');
CREATE TYPE "PunchSource" AS ENUM ('KIOSK', 'ESS', 'IMPORT', 'MANUAL');

-- 2. AttendanceLog table
CREATE TABLE "AttendanceLog" (
  "id"              TEXT          NOT NULL,
  "tenantId"        TEXT          NOT NULL,
  "employeeId"      TEXT          NOT NULL,
  "kioskId"         TEXT,
  "punchType"       "PunchType"   NOT NULL,
  "source"          "PunchSource" NOT NULL,
  "punchedAt"       TIMESTAMP(3)  NOT NULL,
  "selfieKey"       TEXT,
  "latitude"        DECIMAL(10,7),
  "longitude"       DECIMAL(10,7),
  "outsideGeofence" BOOLEAN       NOT NULL DEFAULT false,
  "distanceMeters"  INTEGER,
  "ipAddress"       TEXT,
  "userAgent"       TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- 3. Foreign keys
ALTER TABLE "AttendanceLog"
  ADD CONSTRAINT "AttendanceLog_tenantId_fkey"
    FOREIGN KEY ("tenantId")   REFERENCES "Tenant"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceLog"
  ADD CONSTRAINT "AttendanceLog_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceLog"
  ADD CONSTRAINT "AttendanceLog_kioskId_fkey"
    FOREIGN KEY ("kioskId")    REFERENCES "Kiosk"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Indexes
CREATE INDEX "AttendanceLog_tenantId_employeeId_punchedAt_idx"
  ON "AttendanceLog" ("tenantId", "employeeId", "punchedAt");

CREATE INDEX "AttendanceLog_tenantId_punchedAt_idx"
  ON "AttendanceLog" ("tenantId", "punchedAt");

CREATE INDEX "AttendanceLog_kioskId_idx"
  ON "AttendanceLog" ("kioskId");

-- 5. Row-Level Security (mirrors every other tenant-scoped table)
ALTER TABLE "AttendanceLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "AttendanceLog"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
