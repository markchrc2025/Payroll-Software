-- Attendance-exempt flag: employees (e.g. executives) who receive full pay
-- for every scheduled workday without needing time-clock punches.
-- Only HR / Payroll Admin may enable this per employee.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "attendanceExempt" BOOLEAN NOT NULL DEFAULT false;
