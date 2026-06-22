-- Merge salary (basicSalaryCents + salaryType) into EmploymentTerm.
-- The former EmployeeSalary table is retained (deprecated) for history/rollback.

-- 1. New columns -------------------------------------------------------------
ALTER TABLE "EmploymentTerm" ADD COLUMN "basicSalaryCents" BIGINT;
ALTER TABLE "EmploymentTerm" ADD COLUMN "salaryType" "SalaryType";

-- Movement now carries the salary TYPE alongside the existing amount columns.
ALTER TABLE "EmployeeMovement" ADD COLUMN "fromSalaryType" "SalaryType";
ALTER TABLE "EmployeeMovement" ADD COLUMN "toSalaryType" "SalaryType";

-- 2. Backfill existing term rows --------------------------------------------
-- Stamp each existing EmploymentTerm with the salary in force at its
-- effectiveDate (latest EmployeeSalary on or before that date).
UPDATE "EmploymentTerm" et
SET "basicSalaryCents" = es."basicSalaryCents",
    "salaryType"       = es."salaryType"
FROM "EmployeeSalary" es
WHERE es."id" = (
        SELECT s."id" FROM "EmployeeSalary" s
        WHERE s."employeeId" = et."employeeId"
          AND s."effectiveDate" <= et."effectiveDate"
        ORDER BY s."effectiveDate" DESC, s."createdAt" DESC
        LIMIT 1
      )
  AND et."basicSalaryCents" IS NULL;

-- 3. Materialise salary changes that have no matching term row --------------
-- Every salary effective date without an EmploymentTerm on the same date
-- becomes its own COMPLETE snapshot, carrying forward the terms that were in
-- force at that date.
INSERT INTO "EmploymentTerm" (
  "id", "tenantId", "employeeId", "effectiveDate",
  "jobTypeId", "jobStatusId", "shiftScheduleId", "termStart", "nextReviewDate",
  "basicSalaryCents", "salaryType", "remark", "createdAt", "updatedAt"
)
SELECT
  'mig_' || s."id",
  s."tenantId", s."employeeId", s."effectiveDate",
  prev."jobTypeId", prev."jobStatusId", prev."shiftScheduleId",
  prev."termStart", prev."nextReviewDate",
  s."basicSalaryCents", s."salaryType", s."reason", s."createdAt", now()
FROM "EmployeeSalary" s
LEFT JOIN LATERAL (
  SELECT t."jobTypeId", t."jobStatusId", t."shiftScheduleId",
         t."termStart", t."nextReviewDate"
  FROM "EmploymentTerm" t
  WHERE t."employeeId" = s."employeeId"
    AND t."effectiveDate" <= s."effectiveDate"
  ORDER BY t."effectiveDate" DESC, t."createdAt" DESC
  LIMIT 1
) prev ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM "EmploymentTerm" t2
  WHERE t2."employeeId" = s."employeeId"
    AND t2."effectiveDate" = s."effectiveDate"
);
