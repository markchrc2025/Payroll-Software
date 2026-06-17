-- Remove the rank column from JobType and JobStatus tables.
ALTER TABLE "JobType"   DROP COLUMN IF EXISTS "rank";
ALTER TABLE "JobStatus" DROP COLUMN IF EXISTS "rank";
