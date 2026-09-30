-- Existing-PROD upgrade v1, PREPARE ONLY. Never used by `supabase db push`.
-- Run only after reviewed schema preflight, protected backup and explicit approval.
-- No BASE, no PIN hash data, no removal of old access, no Auth user creation.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public."Employees"') IS NULL OR NOT EXISTS
    (SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Employees' AND column_name='pin_hash' AND data_type='text') THEN
    RAISE EXCEPTION 'Existing legacy Employees.pin_hash text required'; END IF;
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL THEN RAISE EXCEPTION 'Expected pgcrypto in extensions; inspect schema'; END IF;
  IF to_regnamespace('app_private') IS NOT NULL THEN RAISE EXCEPTION 'Upgrade already prepared or unsupported schema; inspect before retry'; END IF;
  IF EXISTS(SELECT FROM public."Employees" WHERE pin_hash IS NOT NULL AND pin_hash !~ '^\$2a\$(06|10)\$[./A-Za-z0-9]{53}$') THEN
    RAISE EXCEPTION 'Unsupported legacy hash format; no credentials changed'; END IF;
END $$;
CREATE SCHEMA app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
CREATE TABLE app_private.production_upgrade (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version text NOT NULL DEFAULT '1', phase text NOT NULL CHECK(phase IN ('prepared','cutover')),
  prepared_at timestamptz NOT NULL DEFAULT now(), cutover_at timestamptz,
  frontend_release text
);
INSERT INTO app_private.production_upgrade(phase) VALUES('prepared');
ALTER TABLE app_private.production_upgrade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.production_upgrade FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."Employees"
  ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN pin_legacy boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT employees_archive_inactive CHECK(archived_at IS NULL OR active IS FALSE);
CREATE INDEX employees_auth_location_idx ON public."Employees"(location_id);
-- Old create_employee remains usable during PREPARE. Its new profiles inherit legacy=true.
-- Tight PIN/role constraints are added only after every identity is ready at CUTOVER.
REVOKE ALL (auth_user_id,archived_at,pin_legacy) ON public."Employees" FROM PUBLIC,anon,authenticated;
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

CREATE FUNCTION public.auth_list_employees()
RETURNS TABLE(id bigint,name text,role text,location_id bigint,active boolean,auth_user_id uuid,archived_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees";
BEGIN
  a:=app_private.actor();
  IF a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.name,e.role,e.location_id,e.active,e.auth_user_id,e.archived_at
    FROM public."Employees" e WHERE a.role='administrator' OR (e.location_id=a.location_id AND e.archived_at IS NULL) ORDER BY e.name,e.id;
END $$;

CREATE OR REPLACE FUNCTION public.auth_save_employee(p_employee_id bigint,p_name text,p_role text,p_location_id bigint,p_active boolean)
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
    IF target.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Najpierw przywróć pracownika' USING ERRCODE='42501'; END IF;
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


-- Uses the same serialization lock and identity guard as auth_save_employee.
-- Explicit desired actions are idempotent; repeated archive preserves its timestamp.
CREATE FUNCTION public.auth_employee_lifecycle(p_employee_id bigint,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; target public."Employees";
BEGIN
  PERFORM pg_advisory_xact_lock(20260923,1);
  a:=app_private.actor();
  IF a.role<>'administrator' OR p_employee_id=a.id THEN
    RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('activate','deactivate','archive','restore') THEN
    RAISE EXCEPTION 'Nieprawidłowa operacja'; END IF;
  SELECT * INTO target FROM public."Employees" WHERE id=p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pracownik nie istnieje'; END IF;
  IF p_action IN ('activate','deactivate') THEN
    PERFORM public.auth_save_employee(target.id,target.name,target.role,target.location_id,p_action='activate');
  ELSIF p_action='archive' THEN
    IF target.archived_at IS NOT NULL THEN RETURN; END IF;
    IF target.role='administrator' AND target.active IS TRUE AND NOT EXISTS
      (SELECT 1 FROM public."Employees" WHERE role='administrator' AND active IS TRUE
        AND auth_user_id IS NOT NULL AND id<>target.id) THEN
      RAISE EXCEPTION 'Nie można usunąć ostatniego aktywnego administratora'; END IF;
    UPDATE public."Employees" SET active=false,archived_at=now() WHERE id=target.id;
  ELSE
    -- A retry must not deactivate a subsequently reactivated employee.
    UPDATE public."Employees" SET active=false,archived_at=NULL
      WHERE id=target.id AND archived_at IS NOT NULL;
  END IF;
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

CREATE TABLE app_private.pin_accounts (
  employee_id bigint PRIMARY KEY REFERENCES public."Employees"(id) ON DELETE RESTRICT,
  provisioning_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CONSTRAINT pin_accounts_email_internal CHECK
    (email ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}@pin\.prod\.invalid$'),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE TABLE app_private.pin_resets (
  operation_id uuid PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES public."Employees"(id),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_private.pin_sources (
  source text PRIMARY KEY CHECK (source ~ '^[a-f0-9]{64}$'),
  blocked_until timestamptz
);
CREATE TABLE app_private.pin_attempts (
  id uuid PRIMARY KEY,
  source text NOT NULL REFERENCES app_private.pin_sources(source),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  used boolean NOT NULL DEFAULT false,
  success boolean NOT NULL DEFAULT false
);
CREATE INDEX pin_attempts_time ON app_private.pin_attempts(created_at);
CREATE INDEX pin_attempts_source_time ON app_private.pin_attempts(source,created_at);
ALTER TABLE app_private.pin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.pin_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.pin_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pin_accounts,app_private.pin_resets,app_private.pin_sources,app_private.pin_attempts FROM PUBLIC,anon,authenticated,service_role;

-- Separate transaction before bcrypt: failures/crashes cannot roll counters back.
CREATE FUNCTION public.pin_reserve(p_source text,p_attempt uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ts timestamptz := clock_timestamp(); blocked timestamptz;
BEGIN
  IF p_source IS NULL OR p_source !~ '^[a-f0-9]{64}$' OR p_attempt IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(20260929,1);
  DELETE FROM app_private.pin_attempts WHERE created_at < ts-interval '1 day';
  DELETE FROM app_private.pin_sources s WHERE (blocked_until IS NULL OR blocked_until<ts)
    AND NOT EXISTS(SELECT 1 FROM app_private.pin_attempts a WHERE a.source=s.source);
  INSERT INTO app_private.pin_sources(source) VALUES(p_source) ON CONFLICT DO NOTHING;
  SELECT blocked_until INTO blocked FROM app_private.pin_sources WHERE source=p_source;
  IF blocked>ts THEN RETURN false; END IF;
  IF (SELECT count(*) FROM app_private.pin_attempts WHERE source=p_source AND NOT success AND created_at>ts-interval '15 minutes')>=10 THEN
    UPDATE app_private.pin_sources SET blocked_until=ts+interval '15 minutes' WHERE source=p_source;
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM app_private.pin_attempts WHERE source=p_source AND created_at>ts-interval '1 minute')>=5
    OR (SELECT count(*) FROM app_private.pin_attempts WHERE created_at>ts-interval '1 minute')>=20 THEN RETURN false; END IF;
  INSERT INTO app_private.pin_attempts(id,source) VALUES(p_attempt,p_source) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.pin_verify(p_attempt uuid,p_source text,p_pin text)
RETURNS TABLE(employee_id bigint,auth_user_id uuid,email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a app_private.pin_attempts; e record; found_id bigint; found_uid uuid; found_email text; matches integer:=0;
BEGIN
  SELECT * INTO a FROM app_private.pin_attempts WHERE id=p_attempt AND source=p_source FOR UPDATE;
  IF NOT FOUND OR a.used OR a.created_at<clock_timestamp()-interval '30 seconds' THEN RETURN; END IF;
  UPDATE app_private.pin_attempts SET used=true WHERE id=p_attempt;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,8}$' THEN RETURN; END IF;
  -- At most two concurrent expensive verifications across all Edge instances.
  IF NOT pg_try_advisory_xact_lock(20260929,2) THEN
    IF NOT pg_try_advisory_xact_lock(20260929,3) THEN RETURN; END IF;
  END IF;
  -- Bounded UAT POC: refuse rather than scan an unbounded workforce.
  IF (SELECT count(*) FROM public."Employees" WHERE pin_hash IS NOT NULL)>32 THEN RETURN; END IF;
  FOR e IN SELECT x.id,x.auth_user_id,x.active,x.role,x.pin_hash,x.pin_legacy,c.email,c.auth_user_id AS linked
    FROM public."Employees" x LEFT JOIN app_private.pin_accounts c ON c.employee_id=x.id
    WHERE x.pin_hash IS NOT NULL ORDER BY x.id LOOP
    IF (e.pin_legacy OR length(p_pin)=4) AND extensions.crypt(p_pin,e.pin_hash)=e.pin_hash AND e.active IS TRUE
       AND e.role IN ('manager','su-chef','employee') AND e.auth_user_id IS NOT NULL AND e.linked=e.auth_user_id THEN
      matches:=matches+1; found_id:=e.id; found_uid:=e.auth_user_id; found_email:=e.email;
    END IF;
  END LOOP;
  IF matches=1 THEN
    UPDATE app_private.pin_attempts SET success=true WHERE id=p_attempt;
    RETURN QUERY SELECT found_id,found_uid,found_email;
  END IF;
END $$;

CREATE FUNCTION app_private.pin_admin(p_actor uuid,p_employee bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public."Employees" WHERE auth_user_id=p_actor AND active IS TRUE AND role='administrator') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Employees" WHERE id=p_employee AND active IS TRUE AND role IN ('manager','su-chef','employee')) THEN
    RAISE EXCEPTION 'Unavailable target' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.pin_prepare(p_actor uuid,p_employee bigint)
RETURNS TABLE(employee_id bigint,provisioning_id uuid,email text,auth_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; c app_private.pin_accounts; u auth.users;
BEGIN
  PERFORM pg_advisory_xact_lock(20260929,4);
  PERFORM app_private.pin_admin(p_actor,p_employee);
  SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
  SELECT * INTO c FROM app_private.pin_accounts WHERE pin_accounts.employee_id=p_employee;
  IF NOT FOUND THEN
    IF e.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'Existing non-PIN identity'; END IF;
    INSERT INTO app_private.pin_accounts(employee_id,email) VALUES(p_employee,gen_random_uuid()::text||'@pin.prod.invalid') RETURNING * INTO c;
  END IF;
  SELECT * INTO u FROM auth.users WHERE auth.users.email=c.email;
  IF FOUND AND (u.raw_app_meta_data->>'pin_provisioning_id' IS DISTINCT FROM c.provisioning_id::text
      OR u.raw_app_meta_data->>'pin_employee_id' IS DISTINCT FROM p_employee::text) THEN RAISE EXCEPTION 'Identity conflict'; END IF;
  IF e.auth_user_id IS NOT NULL AND (e.auth_user_id IS DISTINCT FROM c.auth_user_id OR e.auth_user_id IS DISTINCT FROM u.id) THEN
    RAISE EXCEPTION 'Identity conflict'; END IF;
  RETURN QUERY SELECT c.employee_id,c.provisioning_id,c.email,u.id;
END $$;

CREATE FUNCTION public.pin_finish(p_actor uuid,p_employee bigint,p_auth_user uuid,p_pin text,p_operation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; c app_private.pin_accounts; u auth.users; previous bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(20260929,4);
  PERFORM app_private.pin_admin(p_actor,p_employee);
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid input'; END IF;
  SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
  SELECT * INTO c FROM app_private.pin_accounts WHERE employee_id=p_employee;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not prepared'; END IF;
  SELECT * INTO u FROM auth.users WHERE id=p_auth_user;
  IF NOT FOUND OR u.email IS DISTINCT FROM c.email
    OR u.raw_app_meta_data->>'pin_provisioning_id' IS DISTINCT FROM c.provisioning_id::text
    OR u.raw_app_meta_data->>'pin_employee_id' IS DISTINCT FROM p_employee::text THEN RAISE EXCEPTION 'Identity conflict'; END IF;
  IF e.auth_user_id IS NOT NULL AND e.auth_user_id IS DISTINCT FROM p_auth_user THEN RAISE EXCEPTION 'Already linked'; END IF;
  SELECT employee_id INTO previous FROM app_private.pin_resets WHERE operation_id=p_operation;
  IF FOUND THEN
    IF previous IS DISTINCT FROM p_employee OR e.pin_hash IS NULL OR extensions.crypt(p_pin,e.pin_hash) IS DISTINCT FROM e.pin_hash THEN
      RAISE EXCEPTION 'Operation already used'; END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public."Employees" WHERE id<>p_employee AND pin_hash IS NOT NULL AND extensions.crypt(p_pin,pin_hash)=pin_hash) THEN
    RAISE EXCEPTION 'PIN unavailable'; END IF;
  UPDATE app_private.pin_accounts SET auth_user_id=p_auth_user WHERE employee_id=p_employee;
  UPDATE public."Employees" SET auth_user_id=p_auth_user,pin_legacy=false,pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)) WHERE id=p_employee;
  INSERT INTO app_private.pin_resets(operation_id,employee_id) VALUES(p_operation,p_employee);
END $$;

-- Recheck immediately before returning tokens; RLS still checks live state on every operation.
CREATE FUNCTION public.pin_confirm(p_employee bigint,p_auth_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public."Employees" e JOIN app_private.pin_accounts c ON c.employee_id=e.id
 WHERE e.id=p_employee AND e.auth_user_id=p_auth_user AND c.auth_user_id=p_auth_user
 AND e.active IS TRUE AND e.pin_hash IS NOT NULL AND e.role IN ('manager','su-chef','employee'))
$$;
REVOKE ALL ON FUNCTION app_private.pin_admin(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pin_reserve(text,uuid),public.pin_verify(uuid,text,text),
 public.pin_prepare(uuid,bigint),public.pin_finish(uuid,bigint,uuid,text,uuid),public.pin_confirm(bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pin_reserve(text,uuid),public.pin_verify(uuid,text,text),
 public.pin_prepare(uuid,bigint),public.pin_finish(uuid,bigint,uuid,text,uuid),public.pin_confirm(bigint,uuid)
 TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_location(bigint),app_private.can_read_plan(bigint,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_employee_profile(),public.auth_list_employees(),
 public.auth_save_employee(bigint,text,text,bigint,boolean),public.auth_employee_names(bigint,bigint[]),
 public.auth_link_employee(uuid,bigint,uuid),public.auth_employee_lifecycle(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_employee_profile(),public.auth_list_employees(),
 public.auth_save_employee(bigint,text,text,bigint,boolean),public.auth_employee_names(bigint,bigint[]),public.auth_employee_lifecycle(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_link_employee(uuid,bigint,uuid) TO service_role;

COMMIT;
