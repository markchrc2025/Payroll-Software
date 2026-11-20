-- PAY-149 (Mark, 16 Nov 2026): Deduction Components. A seeded component
-- (Inventory Deduction) cannot be deleted; a loss or damage deduction is
-- marked so its guardrails (PAY-150) can apply.
ALTER TABLE "PayComponent" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayComponent" ADD COLUMN "isLossOrDamage" BOOLEAN NOT NULL DEFAULT false;
