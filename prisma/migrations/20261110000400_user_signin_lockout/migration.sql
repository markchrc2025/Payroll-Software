-- Unit 0.15 Amendment 4 (Mark's ruling of 10 Nov 2026): five wrong passwords
-- in a row lock a dashboard or Central account's sign-in for 15 minutes; a
-- reset link unlocks it at once. Same rule as ESS (Amendment 3).
ALTER TABLE "User"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
