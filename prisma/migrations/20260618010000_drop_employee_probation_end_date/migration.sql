-- Drop probationEndDate from Employee.
-- The field was unused in any business logic; nextReviewDate on EmploymentTerm
-- is the correct place to track the end of a probationary period.
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "probationEndDate";
