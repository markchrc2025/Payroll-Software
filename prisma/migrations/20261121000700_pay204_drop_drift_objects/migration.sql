-- PAY-204, ruling 2 (Mark, 20 Nov 22:57): once nothing is seen to call
-- rls_auto_enable(), drop it and the extra partial index by migration.
-- Checked 21 Nov: the production drift report (which now covers event
-- triggers) lists no event trigger, and no code or migration calls the
-- function. The partial unique index duplicates the full unique index on
-- ("tenantId", code) that every database has (LeaveWorkflow_tenantId_code_key),
-- so no guard is lost. Both drops are guarded: databases without them
-- (every one built from the migrations) are unchanged.
DROP FUNCTION IF EXISTS public.rls_auto_enable();
DROP INDEX IF EXISTS public."ApprovalWorkflow_tenantId_code_key";
