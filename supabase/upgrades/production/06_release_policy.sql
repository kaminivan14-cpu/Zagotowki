-- Production-only release policy. Run last, in the SAME transaction as the modules upgrade.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM app_private.production_upgrade WHERE phase='cutover') THEN RAISE EXCEPTION 'PRODUCTION_BASELINE_MISMATCH';END IF;
 IF EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public."Employees"'::regclass AND tgname='employees_role_alias') THEN RAISE EXCEPTION 'ROLE_ALIAS_MUST_NOT_BE_INSTALLED';END IF;
END $$;
DELETE FROM app_private.role_permissions WHERE
 permission='orders.test.generate' OR
 (role NOT IN ('administrator','manager') AND (permission LIKE 'orders.%' OR permission LIKE 'tasks.%' OR permission LIKE 'processes.%' OR permission LIKE 'dictionaries.%'));
CREATE OR REPLACE FUNCTION app_private.has_permission(p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_permission<>'orders.test.generate' AND EXISTS(
 SELECT FROM public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role
 WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL AND p.permission=p_permission
 AND (e.role IN ('administrator','manager') OR
 NOT (p_permission LIKE 'orders.%' OR p_permission LIKE 'tasks.%' OR p_permission LIKE 'processes.%' OR p_permission LIKE 'dictionaries.%')))
$$;
CREATE OR REPLACE FUNCTION public.auth_capabilities() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.permission FROM public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role
 WHERE e.auth_user_id=auth.uid() AND app_private.has_permission(p.permission) ORDER BY p.permission
$$;
-- Defense at module boundary even if a future individual capability is configured incorrectly.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app_private.orders_actor(text,bigint)'::regprocedure);
 IF position('IF a.archived_at IS NOT NULL' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT orders_actor';END IF;
 d:=replace(d,'IF a.archived_at IS NOT NULL','IF NOT app_private.has_permission(''orders.access'') OR a.archived_at IS NOT NULL');EXECUTE d;
END $$;
COMMIT;
