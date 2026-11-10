-- Unit 0.15 Amendment 3 (Mark's ruling, 10 Nov 2026): ESS sign-in is employee
-- number + a 6-digit PIN the employee sets through their own invitation or
-- reset link. Birth-date sign-in is removed. HR no longer sets PINs.

-- Where invitation and reset links go: personal email at hiring, switchable to
-- the work email later.
CREATE TYPE "EssEmailChoice" AS ENUM ('PERSONAL', 'WORK');

ALTER TABLE "Employee"
  ADD COLUMN "essEmailChoice" "EssEmailChoice" NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN "essFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "essLockedUntil" TIMESTAMP(3);

-- Any PIN HR typed is known to HR, so it is retired. Employees set their own
-- PIN through the invitation or a reset link.
UPDATE "Employee" SET "essPin" = NULL WHERE "essPin" IS NOT NULL;
