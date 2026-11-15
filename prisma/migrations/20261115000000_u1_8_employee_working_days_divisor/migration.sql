-- =============================================================================
-- Unit 1.8 (S4, "monthly means monthly"), B1: Employee.workingDaysDenominator.
--
-- D-S4 (14 Aug 2026): the divisor that turns a monthly or weekly salary into a
-- daily equivalent is an explicit per-employee field, defaulted from the work
-- schedule: 261 for a five-day week, 313 for a six-day week. NULL means the
-- tenant's workingDaysDenominator applies. R89: this is the unit's ONE schema
-- change (no new enum, no new type column, no other backfill).
--
-- Hand-written and idempotent: safe to run twice. No new table, so no new RLS
-- policy (R42) and no GRANT (Employee's grants already cover a new column; per
-- 0.21 this file assumes neither payroll_app nor owner exists).
--
-- Backfill: each employee's schedule is the current EmployeeShiftAssignment
-- (what the punch resolver uses), else the schedule on the latest effective
-- EmploymentTerm. Only five- and six-day schedules get a value; anything else
-- stays NULL (tenant default). Existing values are never overwritten.
-- =============================================================================

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "workingDaysDenominator" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Employee_workingDaysDenominator_range'
  ) THEN
    -- REP-7: a divisor the engine cannot use is refused at the database too.
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workingDaysDenominator_range"
      CHECK ("workingDaysDenominator" IS NULL OR "workingDaysDenominator" BETWEEN 52 AND 366);
  END IF;
END $$;

WITH assigned AS (
  SELECT DISTINCT ON (a."employeeId") a."employeeId", a."shiftScheduleId"
  FROM "EmployeeShiftAssignment" a
  WHERE a."effectiveFrom" <= now()
    AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= now())
  ORDER BY a."employeeId", a."effectiveFrom" DESC
),
termed AS (
  SELECT DISTINCT ON (t."employeeId") t."employeeId", t."shiftScheduleId"
  FROM "EmploymentTerm" t
  WHERE t."shiftScheduleId" IS NOT NULL
    AND t."effectiveDate" <= now()
  ORDER BY t."employeeId", t."effectiveDate" DESC
),
schedule AS (
  SELECT e."id" AS "employeeId",
         COALESCE(a."shiftScheduleId", t."shiftScheduleId") AS "shiftScheduleId"
  FROM "Employee" e
  LEFT JOIN assigned a ON a."employeeId" = e."id"
  LEFT JOIN termed   t ON t."employeeId" = e."id"
),
divisor AS (
  SELECT sc."employeeId",
         CASE jsonb_array_length(s."workDays") WHEN 5 THEN 261 WHEN 6 THEN 313 END AS "value"
  FROM schedule sc
  JOIN "ShiftSchedule" s ON s."id" = sc."shiftScheduleId"
  WHERE jsonb_typeof(s."workDays") = 'array'
    AND jsonb_array_length(s."workDays") IN (5, 6)
)
UPDATE "Employee" e
SET "workingDaysDenominator" = d."value"
FROM divisor d
WHERE e."id" = d."employeeId"
  AND e."workingDaysDenominator" IS NULL;

-- Report, change nothing: employees whose divisor now differs from their
-- tenant's (their OT/holiday daily rate and unpaid-day deduction use it), and
-- employees whose salary type × pay cycle 1.8 refuses (R88). The latter keep
-- running until HR fixes them, but a REGULAR run will refuse their sheet.
DO $$
DECLARE
  differs INTEGER;
  incoherent INTEGER;
BEGIN
  SELECT count(*) INTO differs
  FROM "Employee" e JOIN "Tenant" tn ON tn."id" = e."tenantId"
  WHERE e."workingDaysDenominator" IS NOT NULL
    AND e."workingDaysDenominator" <> tn."workingDaysDenominator";

  SELECT count(*) INTO incoherent
  FROM "Employee" e
  JOIN LATERAL (
    SELECT t."salaryType" FROM "EmploymentTerm" t
    WHERE t."employeeId" = e."id" AND t."basicSalaryCents" IS NOT NULL
    ORDER BY t."effectiveDate" DESC LIMIT 1
  ) lt ON true
  WHERE e."deletedAt" IS NULL
    AND (lt."salaryType", e."payFrequency") IN (
      ('MONTHLY'::"SalaryType", 'WEEKLY'::"PayFrequency"),
      ('MONTHLY'::"SalaryType", 'DAILY'::"PayFrequency"),
      ('MONTHLY'::"SalaryType", 'BI_WEEKLY'::"PayFrequency"),
      ('WEEKLY'::"SalaryType",  'SEMI_MONTHLY'::"PayFrequency"),
      ('WEEKLY'::"SalaryType",  'MONTHLY'::"PayFrequency")
    );

  RAISE NOTICE '[u1.8] employees whose divisor differs from their tenant''s: %', differs;
  RAISE NOTICE '[u1.8] employees with a salary type x pay cycle that 1.8 refuses (R88): %', incoherent;
END $$;
