-- =============================================================================
-- Phase G1: Grant payroll_app access to leave management tables.
-- LeaveType, LeaveBalance, LeaveTransaction were created in b2_realignment and
-- RLS-enabled in enable_rls, but never GRANT-ed to the app role.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "LeaveType"        TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LeaveBalance"     TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LeaveTransaction" TO payroll_app;
