-- PAY-135: a run created for a subset of employees (OFF_CYCLE bonus,
-- FINAL_PAY leaver, YEAR_END) did not store the subset, so the background
-- compute (processRun) and every recompute widened it to every active
-- employee. The subset now lives on the book.
ALTER TABLE "PayrollBook"
  ADD COLUMN IF NOT EXISTS "targetEmployeeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill DRAFT non-REGULAR books from their current sheets, so a later
-- recompute keeps the people they hold today:
--   - a FINAL_PAY made by Offboard (createDraftRun, which did filter) holds
--     just the leaver, and keeps just the leaver;
--   - a queued OFF_CYCLE/FINAL_PAY already widened to everyone keeps everyone,
--     exactly as today (review it before finalizing; see PAY-135).
-- REGULAR books, finalized books and books without sheets stay empty
-- (= every employee the run type selects), i.e. unchanged behaviour.
-- Idempotent: only rows still empty are touched.
UPDATE "PayrollBook" b
SET "targetEmployeeIds" = s.ids
FROM (
  SELECT "payrollBookId", array_agg(DISTINCT "employeeId" ORDER BY "employeeId") AS ids
  FROM "PayrollSheet"
  GROUP BY "payrollBookId"
) s
WHERE s."payrollBookId" = b.id
  AND b."runType" <> 'REGULAR'
  AND b.status = 'DRAFT'
  AND cardinality(b."targetEmployeeIds") = 0;
