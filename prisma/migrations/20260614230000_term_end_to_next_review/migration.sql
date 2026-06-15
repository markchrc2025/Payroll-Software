-- Rename "Term End" to "Next Review".
-- Apply in the Supabase SQL editor before deploying, then run: npx prisma generate
-- Both renames are guarded: if the source column doesn't exist the statement is skipped.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'EmploymentTerm' AND column_name = 'termEnd'
  ) THEN
    ALTER TABLE "EmploymentTerm" RENAME COLUMN "termEnd" TO "nextReviewDate";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'EmployeeMovement' AND column_name = 'toTermEnd'
  ) THEN
    ALTER TABLE "EmployeeMovement" RENAME COLUMN "toTermEnd" TO "toNextReviewDate";
  END IF;
END $$;
