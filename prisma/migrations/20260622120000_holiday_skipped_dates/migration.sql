-- Recurring-holiday per-year cancellations.
-- A recurring Holiday is stored once and expands to every year. Deleting a
-- single year's occurrence ("delete this year only") records that date here
-- instead of soft-deleting the master, so the holiday keeps recurring for all
-- other years.
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "skippedDates" JSONB NOT NULL DEFAULT '[]';
