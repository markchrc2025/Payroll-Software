-- PAY-204 (Mark, 20 Nov 2026, ruling 1): bring every database to the shape
-- production already has and the app declares (prisma/schema.prisma), found
-- by the PAY-58 drift report. Guarded: each change runs only where needed.

-- 1. EmployeeMovement "toTermStart" and "toNextReviewDate": plain timestamp,
--    as production has and the schema declares. Migration 20260614200000
--    added them as TIMESTAMPTZ; the repair 20260614240000 used TIMESTAMP(3)
--    but only where the column was absent. Values are kept as UTC.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['toTermStart', 'toNextReviewDate'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'EmployeeMovement'
         AND column_name = c AND data_type = 'timestamp with time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE "EmployeeMovement" ALTER COLUMN %I TYPE TIMESTAMP(3) USING %I AT TIME ZONE ''UTC''',
        c, c
      );
    END IF;
  END LOOP;
END $$;

-- 2. "Announcement"."updatedAt": no database default, as the migrations
--    create it; the app sets the value itself (@updatedAt).
ALTER TABLE "Announcement" ALTER COLUMN "updatedAt" DROP DEFAULT;
