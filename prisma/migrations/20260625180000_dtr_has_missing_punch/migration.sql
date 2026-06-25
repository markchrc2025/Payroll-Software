-- AlterTable: flag DTR rows that have a clock-in but no clock-out so a
-- forgotten OUT isn't mistaken for a zero-hour present day.
ALTER TABLE "DTRRecord"
  ADD COLUMN "hasMissingPunch" BOOLEAN NOT NULL DEFAULT false;
