-- Apply after the compatible frontend/RPC release. Does not touch credentials.
BEGIN;
UPDATE public."Employees" SET role='crafter' WHERE role='employee';
-- Keep legacy input compatibility for rolling clients; normalize all NEW writes.
CREATE FUNCTION app_private.normalize_employee_role() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.role='employee' THEN NEW.role:='crafter'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.normalize_employee_role() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER employees_role_alias BEFORE INSERT OR UPDATE OF role ON public."Employees"
FOR EACH ROW EXECUTE FUNCTION app_private.normalize_employee_role();
COMMIT;
