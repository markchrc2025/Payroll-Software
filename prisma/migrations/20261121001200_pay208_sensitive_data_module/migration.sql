-- Wave A1 (PAY-208): a permission module for sensitive personal information
-- (ethnicity, religion). Added in its own migration: a new enum value cannot
-- be used in the transaction that adds it.
ALTER TYPE "PermissionModule" ADD VALUE IF NOT EXISTS 'SENSITIVE_DATA';
