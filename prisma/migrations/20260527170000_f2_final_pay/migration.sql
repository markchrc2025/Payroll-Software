-- CreateEnum
CREATE TYPE "SeparationReason" AS ENUM ('RESIGNATION', 'MUTUAL_AGREEMENT', 'END_OF_CONTRACT', 'REDUNDANCY', 'RETRENCHMENT', 'CLOSURE_OF_BUSINESS', 'DISEASE', 'JUST_CAUSE');

-- AlterTable
ALTER TABLE "PayrollBook" ADD COLUMN     "separationReason" "SeparationReason";

-- AlterTable
ALTER TABLE "PayrollSheet" ADD COLUMN     "finalPayBreakdown" JSONB;

