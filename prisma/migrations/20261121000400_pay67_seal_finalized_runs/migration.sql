-- PAY-67 (1.12; Q1: the sealed record is a posted payroll run, never
-- modified, never deleted; Q5b: posted runs are sealed and never recomputed;
-- Q8b: finalized runs and payslips are never editable).
--
-- Once a PayrollBook is FINALIZED, the database refuses, whatever the
-- application does:
--   * any change to the run, value to another value or value to NULL, except
--     updatedAt;
--   * deleting the run;
--   * adding, changing or deleting one of its payslips, except the stored
--     PDF's key (payslipKey, written by the publish job after the seal) and
--     updatedAt;
--   * adding, changing or deleting one of its payroll adjustments.
-- A database superuser is not refused: a superuser can switch triggers off
-- anyway, so the seal binds the application's roles (payroll_app and the
-- table owner), not the database administrator.

ALTER TABLE "PayrollSheet" ADD COLUMN "sealSnapshot" JSONB;

CREATE OR REPLACE FUNCTION pay67_is_superuser() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) $$;

-- The columns of a row that changed, other than the ones allowed to.
CREATE OR REPLACE FUNCTION pay67_changed(old_row jsonb, new_row jsonb, allowed text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(k ORDER BY k), '{}')
    FROM (SELECT key AS k FROM jsonb_object_keys(old_row || new_row) AS key) keys
   WHERE NOT (k = ANY (allowed))
     AND (old_row -> k) IS DISTINCT FROM (new_row -> k)
$$;

CREATE OR REPLACE FUNCTION pay67_seal_book() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE changed text[];
BEGIN
  IF pay67_is_superuser() OR OLD.status <> 'FINALIZED' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payroll run % is sealed: a finalized run cannot be deleted', COALESCE(OLD."controlNumber", OLD.id) USING ERRCODE = 'check_violation';
  END IF;
  changed := pay67_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updatedAt']);
  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION 'payroll run % is sealed: % cannot be changed', COALESCE(OLD."controlNumber", OLD.id), array_to_string(changed, ', ') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION pay67_book_is_sealed(book_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM "PayrollBook" WHERE id = book_id AND status = 'FINALIZED') $$;

CREATE OR REPLACE FUNCTION pay67_seal_sheet() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE changed text[];
BEGIN
  IF pay67_is_superuser() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND pay67_book_is_sealed(OLD."payrollBookId") THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'payslip % is sealed: it belongs to a finalized run', COALESCE(OLD."controlNumber", OLD.id) USING ERRCODE = 'check_violation';
    END IF;
    changed := pay67_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['payslipKey', 'updatedAt']);
    IF array_length(changed, 1) > 0 THEN
      RAISE EXCEPTION 'payslip % is sealed: % cannot be changed', COALESCE(OLD."controlNumber", OLD.id), array_to_string(changed, ', ') USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND pay67_book_is_sealed(NEW."payrollBookId") AND (TG_OP = 'INSERT' OR NEW."payrollBookId" IS DISTINCT FROM OLD."payrollBookId") THEN
    RAISE EXCEPTION 'payroll run % is sealed: no payslip can be added to it', NEW."payrollBookId" USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE OR REPLACE FUNCTION pay67_seal_adjustment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pay67_is_superuser() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF (TG_OP IN ('UPDATE', 'DELETE') AND pay67_book_is_sealed(OLD."payrollBookId"))
     OR (TG_OP IN ('INSERT', 'UPDATE') AND pay67_book_is_sealed(NEW."payrollBookId")) THEN
    RAISE EXCEPTION 'payroll run is sealed: its adjustments cannot be added, changed or deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

DROP TRIGGER IF EXISTS pay67_seal_book ON "PayrollBook";
CREATE TRIGGER pay67_seal_book BEFORE UPDATE OR DELETE ON "PayrollBook"
  FOR EACH ROW EXECUTE FUNCTION pay67_seal_book();
DROP TRIGGER IF EXISTS pay67_seal_sheet ON "PayrollSheet";
CREATE TRIGGER pay67_seal_sheet BEFORE INSERT OR UPDATE OR DELETE ON "PayrollSheet"
  FOR EACH ROW EXECUTE FUNCTION pay67_seal_sheet();
DROP TRIGGER IF EXISTS pay67_seal_adjustment ON "PayrollAdjustment";
CREATE TRIGGER pay67_seal_adjustment BEFORE INSERT OR UPDATE OR DELETE ON "PayrollAdjustment"
  FOR EACH ROW EXECUTE FUNCTION pay67_seal_adjustment();
