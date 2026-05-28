-- AlterTable: add annualizationData JSONB column to PayrollSheet
ALTER TABLE "PayrollSheet" ADD COLUMN "annualizationData" JSONB;
