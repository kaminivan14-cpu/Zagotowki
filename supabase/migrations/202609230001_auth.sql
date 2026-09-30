-- Auth cutover. Run on a verified staging snapshot first; see docs/auth-rollout.md.
-- Existing production RPC bodies are preserved, with a mandatory identity guard.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

ALTER TABLE public."Employees"
  ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."Employees"
  ADD CONSTRAINT employees_auth_role CHECK (role IS NOT NULL AND role IN ('employee','su-chef','manager','administrator')),
  ADD CONSTRAINT employees_auth_location CHECK (role = 'administrator' OR location_id IS NOT NULL);
CREATE INDEX employees_auth_location_idx ON public."Employees"(location_id);

CREATE FUNCTION app_private.actor()
RETURNS public."Employees" LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE e public."Employees";
BEGIN
  SELECT * INTO e FROM public."Employees"
    WHERE auth_user_id = auth.uid() AND active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brak aktywnego konta pracownika' USING ERRCODE = '42501'; END IF;
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION app_private.actor() FROM PUBLIC;

CREATE FUNCTION app_private.assert_requester(requester bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE e public."Employees";
BEGIN
  e := app_private.actor();
  IF requester IS DISTINCT FROM e.id THEN
    RAISE EXCEPTION 'Tożsamość nie odpowiada sesji' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.assert_requester(bigint) FROM PUBLIC;

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

CREATE FUNCTION public.auth_employee_profile()
RETURNS TABLE(id bigint, name text, role text, location_id bigint, active boolean, auth_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT e.id,e.name,e.role,e.location_id,e.active,e.auth_user_id
  FROM public."Employees" e WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE $$;

CREATE FUNCTION app_private.can_read_location(target bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT EXISTS (SELECT 1 FROM public."Employees" e WHERE e.auth_user_id=auth.uid()
  AND e.active IS TRUE AND (e.role='administrator' OR e.location_id=target)) $$;

CREATE FUNCTION app_private.can_read_plan(target_location bigint, target_status text, target_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT EXISTS (SELECT 1 FROM public."Employees" e WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE
  AND (e.role='administrator' OR e.location_id=target_location)
  AND (e.role<>'employee' OR (target_status='active'
    AND target_date = (now() AT TIME ZONE 'Europe/Warsaw')::date))) $$;

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

CREATE FUNCTION public.auth_list_employees()
RETURNS TABLE(id bigint,name text,role text,location_id bigint,active boolean,auth_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees";
BEGIN
  a:=app_private.actor();
  IF a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.name,e.role,e.location_id,e.active,e.auth_user_id
    FROM public."Employees" e WHERE a.role='administrator' OR e.location_id=a.location_id ORDER BY e.name,e.id;
END $$;

CREATE FUNCTION public.auth_save_employee(p_employee_id bigint,p_name text,p_role text,p_location_id bigint,p_active boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; target public."Employees"; result bigint;
BEGIN
  -- Serialize role/account edits, including the last-administrator check.
  PERFORM pg_advisory_xact_lock(20260923,1);
  a:=app_private.actor();
  IF a.role NOT IN ('administrator','manager') OR p_employee_id=a.id THEN
    RAISE EXCEPTION 'Brak uprawnień do edycji tego konta' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('employee','su-chef','manager','administrator') OR
    p_active IS NULL OR p_name IS NULL OR length(trim(p_name))=0 THEN RAISE EXCEPTION 'Nieprawidłowe dane'; END IF;
  IF p_role<>'administrator' AND p_location_id IS NULL THEN RAISE EXCEPTION 'Wybierz lokal'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Locations" WHERE id=p_location_id AND active IS TRUE) THEN
    RAISE EXCEPTION 'Nieaktywny lub nieistniejący lokal'; END IF;
  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO target FROM public."Employees" WHERE id=p_employee_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pracownik nie istnieje'; END IF;
  END IF;
  IF a.role='manager' AND (p_role NOT IN ('employee','su-chef') OR p_location_id IS DISTINCT FROM a.location_id OR
    (p_employee_id IS NOT NULL AND (target.role NOT IN ('employee','su-chef') OR target.location_id IS DISTINCT FROM a.location_id))) THEN
    RAISE EXCEPTION 'Manager zarządza tylko employee i su-chef w swoim lokalu' USING ERRCODE='42501'; END IF;
  IF target.role='administrator' AND target.active IS TRUE AND (p_role<>'administrator' OR NOT p_active)
    AND NOT EXISTS (SELECT 1 FROM public."Employees" WHERE role='administrator' AND active IS TRUE AND auth_user_id IS NOT NULL AND id<>target.id) THEN
    RAISE EXCEPTION 'Nie można usunąć ostatniego aktywnego administratora'; END IF;
  IF p_employee_id IS NULL THEN
    INSERT INTO public."Employees"(name,role,location_id,active) VALUES(trim(p_name),p_role,p_location_id,p_active) RETURNING id INTO result;
  ELSE
    UPDATE public."Employees" SET name=trim(p_name),role=p_role,location_id=p_location_id,active=p_active WHERE id=p_employee_id RETURNING id INTO result;
  END IF;
  RETURN result;
END $$;

-- Retains the existing history API but authenticates the requester and limits names to their location.
CREATE FUNCTION public.auth_employee_names(p_requester_id bigint,p_employee_ids bigint[])
RETURNS TABLE(id bigint,name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees";
BEGIN
  PERFORM app_private.assert_requester(p_requester_id); a:=app_private.actor();
  RETURN QUERY SELECT e.id,e.name FROM public."Employees" e WHERE e.id=ANY(p_employee_ids)
    AND (a.role='administrator' OR e.location_id=a.location_id);
END $$;

-- Service-only helper; caller identity is verified by the Edge Function, never taken from its JSON body.
CREATE FUNCTION public.auth_link_employee(p_actor uuid,p_employee_id bigint,p_auth_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; target public."Employees";
BEGIN
  PERFORM pg_advisory_xact_lock(20260923,1);
  SELECT * INTO a FROM public."Employees" WHERE auth_user_id=p_actor AND active IS TRUE;
  IF NOT FOUND OR a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  SELECT * INTO target FROM public."Employees" WHERE id=p_employee_id FOR UPDATE;
  IF NOT FOUND OR target.active IS NOT TRUE OR target.auth_user_id IS NOT NULL OR target.id=a.id THEN
    RAISE EXCEPTION 'Pracownik nie jest dostępny do powiązania' USING ERRCODE='42501'; END IF;
  IF a.role='manager' AND (target.role NOT IN ('employee','su-chef') OR target.location_id IS DISTINCT FROM a.location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do pracownika' USING ERRCODE='42501'; END IF;
  IF p_auth_user_id IS NOT NULL THEN
    UPDATE public."Employees" SET auth_user_id=p_auth_user_id WHERE id=target.id;
  END IF;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_read_location(bigint),app_private.can_read_plan(bigint,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_employee_profile(),public.auth_list_employees(),
  public.auth_save_employee(bigint,text,text,bigint,boolean),public.auth_employee_names(bigint,bigint[]),
  public.auth_link_employee(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_employee_profile(),public.auth_list_employees(),
  public.auth_save_employee(bigint,text,text,bigint,boolean),public.auth_employee_names(bigint,bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_link_employee(uuid,bigint,uuid) TO service_role;
COMMIT;
