-- CUTOVER is deliberately separate from PREPARE/PROVISION. One atomic transaction.
-- Set app.rollout_frontend_release transaction-locally via the reviewed executor.
BEGIN;
SELECT pg_advisory_xact_lock(20260930,2);
LOCK TABLE public."Employees" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF (SELECT phase FROM app_private.production_upgrade WHERE singleton) IS DISTINCT FROM 'prepared' THEN
    RAISE EXCEPTION 'Expected PREPARE; cutover not repeated'; END IF;
  IF length(coalesce(current_setting('app.rollout_frontend_release',true),''))<7 THEN
    RAISE EXCEPTION 'Missing verified compatible frontend release'; END IF;
  IF to_regprocedure('public.upgrade_login_coverage()') IS NULL THEN
    RAISE EXCEPTION 'Readiness/coverage patch required'; END IF;
  -- All profiles must be technically ready; coverage is reported separately.
  IF EXISTS(SELECT FROM public.upgrade_readiness() WHERE NOT ready) THEN
    RAISE EXCEPTION 'Technical identity, legacy hash, administrator or ban readiness failed'; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; seq text; BEGIN
 FOREACH t IN ARRAY ARRAY['Employees','Locations','Plans','Plan_items','Products','Recipe_ingredients'] LOOP
  seq:=pg_get_serial_sequence(format('public.%I',t),'id');
  IF seq IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',seq); END IF;
 END LOOP;
END $$;
ALTER TABLE public."Employees" ALTER COLUMN pin_legacy SET DEFAULT false;
ALTER TABLE public."Employees"
 ADD CONSTRAINT employees_auth_role CHECK(role IS NOT NULL AND role IN ('administrator','manager','su-chef','employee')),
 ADD CONSTRAINT employees_auth_location CHECK(role='administrator' OR location_id IS NOT NULL),
 ADD CONSTRAINT employees_pin_bcrypt CHECK(pin_hash IS NULL OR pin_hash ~ '^\$2a\$(06|10)\$[./A-Za-z0-9]{53}$'),
 ADD CONSTRAINT employees_pin_role CHECK(pin_hash IS NULL OR
   (pin_legacy AND role='administrator') OR
   (role IN ('manager','su-chef','employee') AND auth_user_id IS NOT NULL AND
     (pin_legacy OR pin_hash ~ '^\$2a\$10\$[./A-Za-z0-9]{53}$')));
-- Fail closed: remove legacy callable endpoints, including PIN/account RPCs.
-- Extension functions are not application endpoints and are left alone.
DO $$
DECLARE f record; wrapped text; required text;
  allowed text[] := ARRAY['create_production_plan','update_production_plan','complete_production_plan',
    'reopen_production_plan','delete_production_plan','add_plan_item','update_plan_item',
    'delete_plan_item','start_plan_item','complete_plan_item'];
BEGIN
  FOREACH required IN ARRAY ARRAY['create_production_plan','update_production_plan',
    'complete_production_plan','add_plan_item','update_plan_item','delete_plan_item',
    'start_plan_item','complete_plan_item'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=required) THEN
      RAISE EXCEPTION 'Brak wymaganej funkcji %. Najpierw sprawdź schemat.', required;
    END IF;
  END LOOP;
  FOR f IN SELECT p.oid, p.proname, p.prosrc, p.proargnames, p.prokind, l.lanname,
    pg_get_functiondef(p.oid) AS definition, p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e' AND d.classid='pg_proc'::regclass)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
    IF f.proname = ANY(allowed) THEN
      IF f.lanname <> 'plpgsql' OR f.proargnames[1] IS DISTINCT FROM 'p_requester_id'
         OR f.prosrc !~* '^\s*(DECLARE|BEGIN)(\s|$)' OR f.prosrc !~* 'END\s*;?\s*$'
         OR length(f.definition)-length(replace(f.definition,f.prosrc,'')) <> length(f.prosrc) THEN
        RAISE EXCEPTION 'Nietypowa definicja %; przerwano całą migrację', f.signature;
      END IF;
      wrapped := E'BEGIN\nPERFORM app_private.assert_requester(p_requester_id);\n' || rtrim(f.prosrc, E' \t\r\n');
      IF right(wrapped,1) <> ';' THEN wrapped := wrapped || ';'; END IF;
      wrapped := wrapped || E'\nEND;';
      EXECUTE overlay(f.definition PLACING wrapped FROM position(f.prosrc IN f.definition) FOR length(f.prosrc));
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.signature);
    END IF;
  END LOOP;
END $$;

-- Replace public-read policies, rather than OR-ing restrictive policies with them.
DO $$
DECLARE t text; p record; c record;
BEGIN
  FOREACH t IN ARRAY ARRAY['Employees','Locations','Plans','Plan_items','Products','Recipe_ingredients'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
    -- Column-level grants survive a table-level REVOKE.
    FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',c.attname,t);
    END LOOP;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
    END LOOP;
    IF t <> 'Employees' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); END IF;
  END LOOP;
END $$;
-- Employees is accessed through narrow RPC projections; pin_hash is never returned.
CREATE POLICY auth_locations ON public."Locations" FOR SELECT TO authenticated
  USING (active IS TRUE AND app_private.can_read_location(id));
CREATE POLICY auth_plans ON public."Plans" FOR SELECT TO authenticated
  USING (app_private.can_read_plan(location_id,status,plan_date));
CREATE POLICY auth_items ON public."Plan_items" FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public."Plans" p WHERE p.id=plan_id));
CREATE POLICY auth_products ON public."Products" FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.auth_employee_profile()));
CREATE POLICY auth_recipes ON public."Recipe_ingredients" FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.auth_employee_profile()));

-- Authenticated production operations, preserving the current-day/active-plan rules.

CREATE OR REPLACE FUNCTION public.start_plan_item(p_requester_id bigint,p_item_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; p public."Plans"; item public."Plan_items";
BEGIN
  PERFORM app_private.assert_requester(p_requester_id); a:=app_private.actor();
  SELECT plan.* INTO p FROM public."Plans" plan JOIN public."Plan_items" i ON i.plan_id=plan.id WHERE i.id=p_item_id FOR UPDATE OF plan;
  IF NOT FOUND OR p.status IS DISTINCT FROM 'active' OR p.plan_date IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Warsaw')::date
    OR (a.role<>'administrator' AND a.location_id IS DISTINCT FROM p.location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do aktywnego planu na dziś' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public."Plan_items" WHERE id=p_item_id AND plan_id=p.id FOR UPDATE;
  IF NOT FOUND OR item.started_at IS NOT NULL OR item.gotowe IS TRUE THEN RAISE EXCEPTION 'Pozycja nie jest dostępna do rozpoczęcia'; END IF;
  UPDATE public."Plan_items" SET started_at=now(),completed_at=NULL,gotowe=false WHERE id=p_item_id;
END $$;

CREATE OR REPLACE FUNCTION public.complete_plan_item(p_requester_id bigint,p_item_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; p public."Plans"; item public."Plan_items";
BEGIN
  PERFORM app_private.assert_requester(p_requester_id); a:=app_private.actor();
  SELECT plan.* INTO p FROM public."Plans" plan JOIN public."Plan_items" i ON i.plan_id=plan.id WHERE i.id=p_item_id FOR UPDATE OF plan;
  IF NOT FOUND OR p.status IS DISTINCT FROM 'active' OR p.plan_date IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Warsaw')::date
    OR (a.role<>'administrator' AND a.location_id IS DISTINCT FROM p.location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do aktywnego planu na dziś' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public."Plan_items" WHERE id=p_item_id AND plan_id=p.id FOR UPDATE;
  IF NOT FOUND OR item.started_at IS NULL OR item.gotowe IS TRUE THEN RAISE EXCEPTION 'Pozycja nie jest dostępna do zakończenia'; END IF;
  UPDATE public."Plan_items" SET completed_at=now(),gotowe=true,employee_id=a.id WHERE id=p_item_id;
END $$;
REVOKE ALL ON FUNCTION public.start_plan_item(bigint,bigint),public.complete_plan_item(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_plan_item(bigint,bigint),public.complete_plan_item(bigint,bigint) TO authenticated;

-- Generic legacy revocation above also closes new narrow APIs; regrant only this allowlist.
GRANT EXECUTE ON FUNCTION public.auth_employee_profile(),public.auth_list_employees(),
 public.auth_save_employee(bigint,text,text,bigint,boolean),public.auth_employee_names(bigint,bigint[]),
 public.auth_employee_lifecycle(bigint,text) TO authenticated;
UPDATE app_private.production_upgrade SET phase='cutover',cutover_at=now(),
 frontend_release=current_setting('app.rollout_frontend_release') WHERE singleton;
COMMIT;
