-- =============================================================================
-- Unit 0.15 Amendment 2 (rulings B7 and B8, 10 Nov 2026): HR/admin and Central
-- accounts.
--
-- B7: invitations and password resets are separate engines. PasswordResetToken
-- carried both with no way to tell them apart, so a "reset" link sent to an
-- inactive Central admin activated the account. `purpose` records which engine
-- issued a row. Existing rows become RESET (the safe reading: a RESET never
-- activates); an outstanding Central invitation must be re-sent.
--
-- B8: a password change or reset ends every running session. Tenant and
-- Central sessions are stateless JWTs, so they cannot be deleted; instead
-- every session signed in before `sessionsValidAfter` is rejected.
--
-- Additive only. No row is rewritten except by the column defaults.
-- =============================================================================

CREATE TYPE "UserLinkPurpose" AS ENUM ('INVITE', 'RESET');

ALTER TABLE "PasswordResetToken"
  ADD COLUMN "purpose" "UserLinkPurpose" NOT NULL DEFAULT 'RESET';

ALTER TABLE "User"
  ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);
