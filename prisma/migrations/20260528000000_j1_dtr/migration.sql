-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('FIXED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "DTRStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DTRDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'REST_DAY');

-- CreateTable
CREATE TABLE "ShiftSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL DEFAULT 'FIXED',
    "timeIn" TEXT NOT NULL,
    "timeOut" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "workDays" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeShiftAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftScheduleId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DTRRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftScheduleId" TEXT,
    "dayStatus" "DTRDayStatus" NOT NULL DEFAULT 'PRESENT',
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "otMinutes" INTEGER NOT NULL DEFAULT 0,
    "nsdMinutes" INTEGER NOT NULL DEFAULT 0,
    "hazardMinutes" INTEGER NOT NULL DEFAULT 0,
    "holidayType" TEXT,
    "approvalStatus" "DTRStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DTRRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftSchedule_tenantId_idx" ON "ShiftSchedule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftSchedule_tenantId_name_key" ON "ShiftSchedule"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EmployeeShiftAssignment_tenantId_idx" ON "EmployeeShiftAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeShiftAssignment_tenantId_employeeId_effectiveFrom_idx" ON "EmployeeShiftAssignment"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DTRRecord_tenantId_idx" ON "DTRRecord"("tenantId");

-- CreateIndex
CREATE INDEX "DTRRecord_tenantId_employeeId_date_idx" ON "DTRRecord"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "DTRRecord_tenantId_approvalStatus_idx" ON "DTRRecord"("tenantId", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DTRRecord_tenantId_employeeId_date_key" ON "DTRRecord"("tenantId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_shiftScheduleId_fkey" FOREIGN KEY ("shiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRRecord" ADD CONSTRAINT "DTRRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRRecord" ADD CONSTRAINT "DTRRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRRecord" ADD CONSTRAINT "DTRRecord_shiftScheduleId_fkey" FOREIGN KEY ("shiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "ShiftSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeShiftAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DTRRecord" ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "tenant_isolation" ON "ShiftSchedule"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "EmployeeShiftAssignment"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "DTRRecord"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Grant to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON "ShiftSchedule" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeShiftAssignment" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DTRRecord" TO payroll_app;
