-- PAY-172 (Mark, 19 Nov 2026): strict DTR policy per company, and the run's
-- list of employees who lacked an approved DTR for days of its cutoff.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "strictDtrPolicy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayrollBook" ADD COLUMN IF NOT EXISTS "dtrGaps" JSONB;
