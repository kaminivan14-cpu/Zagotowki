-- PIN POC. No data, PINs, Auth users or existing policies are changed here.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public."Employees" ADD COLUMN pin_hash text;
ALTER TABLE public."Employees" ADD CONSTRAINT employees_pin_role CHECK
  (pin_hash IS NULL OR (role IN ('manager','su-chef','employee') AND auth_user_id IS NOT NULL));
ALTER TABLE public."Employees" ADD CONSTRAINT employees_pin_bcrypt CHECK
  (pin_hash IS NULL OR pin_hash ~ '^\$2[aby]\$10\$[./A-Za-z0-9]{53}$');
REVOKE ALL (pin_hash) ON public."Employees" FROM PUBLIC, anon, authenticated;

CREATE TABLE app_private.pin_accounts (
  employee_id bigint PRIMARY KEY REFERENCES public."Employees"(id) ON DELETE RESTRICT,
  provisioning_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CONSTRAINT pin_accounts_email_internal CHECK
    (email ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}@pin\.uat\.invalid$'),
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
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RETURN; END IF;
  -- At most two concurrent expensive verifications across all Edge instances.
  IF NOT pg_try_advisory_xact_lock(20260929,2) THEN
    IF NOT pg_try_advisory_xact_lock(20260929,3) THEN RETURN; END IF;
  END IF;
  -- Bounded UAT POC: refuse rather than scan an unbounded workforce.
  IF (SELECT count(*) FROM public."Employees" WHERE pin_hash IS NOT NULL)>32 THEN RETURN; END IF;
  FOR e IN SELECT x.id,x.auth_user_id,x.active,x.role,x.pin_hash,c.email,c.auth_user_id AS linked
    FROM public."Employees" x LEFT JOIN app_private.pin_accounts c ON c.employee_id=x.id
    WHERE x.pin_hash IS NOT NULL ORDER BY x.id LOOP
    IF extensions.crypt(p_pin,e.pin_hash)=e.pin_hash AND e.active IS TRUE
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
    INSERT INTO app_private.pin_accounts(employee_id,email) VALUES(p_employee,gen_random_uuid()::text||'@pin.uat.invalid') RETURNING * INTO c;
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
  UPDATE public."Employees" SET auth_user_id=p_auth_user,pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)) WHERE id=p_employee;
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
COMMIT;
