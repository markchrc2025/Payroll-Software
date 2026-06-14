-- Rename "Term End" to "Next Review".
-- Apply in the Supabase SQL editor before deploying, then run: npx prisma generate

ALTER TABLE "EmploymentTerm"   RENAME COLUMN "termEnd"   TO "nextReviewDate";
ALTER TABLE "EmployeeMovement" RENAME COLUMN "toTermEnd" TO "toNextReviewDate";
