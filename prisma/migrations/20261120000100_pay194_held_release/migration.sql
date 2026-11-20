-- PAY-194 (Mark, 20 Nov 2026, ruling A): a salary held under the strict DTR
-- policy is released in the next regular run once the DTR is approved. The
-- releasing sheet records which held cutoff it pays and that cutoff's figures.
ALTER TABLE "PayrollSheet" ADD COLUMN "heldRelease" JSONB;
