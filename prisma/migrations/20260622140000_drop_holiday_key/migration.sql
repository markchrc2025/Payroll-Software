-- Drop the vestigial holidayKey fields.
--
-- Holiday applicability is resolved at payroll-run time from the employee's
-- branch (see src/lib/holidays/scope.ts → holidayAppliesToBranch): company-wide
-- holidays apply to everyone; branch-specific holidays apply only to employees
-- whose branch is listed on the holiday. These per-employee / per-term /
-- per-movement holidayKey columns were never read by any computation, so the
-- "Holiday" picker they backed has been removed from the UI.
ALTER TABLE "Employee"         DROP COLUMN IF EXISTS "holidayKey";
ALTER TABLE "EmploymentTerm"   DROP COLUMN IF EXISTS "holidayKey";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "toHolidayKey";
