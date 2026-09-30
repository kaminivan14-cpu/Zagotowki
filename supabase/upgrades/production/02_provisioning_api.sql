-- PREPARE extension: service-only, PIN-free identity provisioning. No remote API calls.
BEGIN;
CREATE FUNCTION app_private.upgrade_prepared() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF (SELECT phase FROM app_private.production_upgrade WHERE singleton) IS DISTINCT FROM 'prepared' THEN
   RAISE EXCEPTION 'Upgrade is not in PREPARE'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.upgrade_prepared() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.upgrade_candidates() RETURNS TABLE(employee_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT id FROM public."Employees" WHERE pin_hash IS NOT NULL AND pin_legacy
 AND role IN ('manager','su-chef','employee') ORDER BY id
$$;

CREATE FUNCTION public.upgrade_pin_prepare(p_employee bigint)
RETURNS TABLE(employee_id bigint,provisioning_id uuid,email text,auth_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; c app_private.pin_accounts; u auth.users;
BEGIN
 PERFORM pg_advisory_xact_lock(20260929,4);
 PERFORM app_private.upgrade_prepared();
 SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND OR e.role NOT IN ('manager','su-chef','employee') OR e.pin_hash IS NULL OR NOT e.pin_legacy THEN
   RAISE EXCEPTION 'Unavailable legacy profile'; END IF;
 SELECT * INTO c FROM app_private.pin_accounts WHERE pin_accounts.employee_id=e.id;
 IF NOT FOUND THEN
   IF e.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'Existing identity requires review'; END IF;
   INSERT INTO app_private.pin_accounts(employee_id,email)
     VALUES(e.id,gen_random_uuid()::text||'@pin.prod.invalid') RETURNING * INTO c;
 END IF;
 SELECT * INTO u FROM auth.users WHERE auth.users.email=c.email;
 IF FOUND AND (u.raw_app_meta_data->>'pin_employee_id' IS DISTINCT FROM e.id::text
   OR u.raw_app_meta_data->>'pin_provisioning_id' IS DISTINCT FROM c.provisioning_id::text) THEN
   RAISE EXCEPTION 'Identity conflict'; END IF;
 IF e.auth_user_id IS NOT NULL AND (e.auth_user_id IS DISTINCT FROM u.id OR e.auth_user_id IS DISTINCT FROM c.auth_user_id) THEN
   RAISE EXCEPTION 'Identity conflict'; END IF;
 RETURN QUERY SELECT e.id,c.provisioning_id,c.email,u.id;
END $$;

CREATE FUNCTION public.upgrade_pin_finish(p_employee bigint,p_auth_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; c app_private.pin_accounts; u auth.users;
BEGIN
 PERFORM pg_advisory_xact_lock(20260929,4);
 PERFORM app_private.upgrade_prepared();
 SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND OR e.role NOT IN ('manager','su-chef','employee') OR e.pin_hash IS NULL OR NOT e.pin_legacy THEN
   RAISE EXCEPTION 'Unavailable legacy profile'; END IF;
 SELECT * INTO c FROM app_private.pin_accounts WHERE employee_id=e.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not prepared'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=p_auth_user;
 IF NOT FOUND OR u.email IS DISTINCT FROM c.email OR u.email_confirmed_at IS NULL
   OR u.raw_app_meta_data->>'pin_employee_id' IS DISTINCT FROM e.id::text
   OR u.raw_app_meta_data->>'pin_provisioning_id' IS DISTINCT FROM c.provisioning_id::text
   OR (u.banned_until IS NOT NULL AND u.banned_until>now()) THEN RAISE EXCEPTION 'Identity conflict'; END IF;
 IF (e.auth_user_id IS NOT NULL AND e.auth_user_id IS DISTINCT FROM u.id)
   OR (c.auth_user_id IS NOT NULL AND c.auth_user_id IS DISTINCT FROM u.id) THEN RAISE EXCEPTION 'Already linked'; END IF;
 UPDATE app_private.pin_accounts SET auth_user_id=u.id WHERE employee_id=e.id AND auth_user_id IS DISTINCT FROM u.id;
 -- Deliberately no PIN parameter, no hash assignment, no activation or profile rewrite.
 UPDATE public."Employees" SET auth_user_id=u.id WHERE id=e.id AND auth_user_id IS DISTINCT FROM u.id;
END $$;

CREATE FUNCTION public.upgrade_link_administrator(p_employee bigint,p_auth_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; u auth.users;
BEGIN
 PERFORM pg_advisory_xact_lock(20260923,1);
 PERFORM app_private.upgrade_prepared();
 SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND OR e.role<>'administrator' OR e.active IS NOT TRUE OR e.archived_at IS NOT NULL THEN
   RAISE EXCEPTION 'Unavailable administrator'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=p_auth_user;
 IF NOT FOUND OR u.email_confirmed_at IS NULL OR coalesce(u.encrypted_password,'')=''
   OR u.email IS NULL OR u.email LIKE '%.invalid' OR u.raw_app_meta_data ? 'pin_employee_id'
   OR (u.banned_until IS NOT NULL AND u.banned_until>now()) THEN RAISE EXCEPTION 'Verified password account required'; END IF;
 IF e.auth_user_id IS NOT NULL AND e.auth_user_id IS DISTINCT FROM u.id THEN RAISE EXCEPTION 'Already linked'; END IF;
 -- The old administrator hash remains stored, but pin_verify excludes this role.
 UPDATE public."Employees" SET auth_user_id=u.id WHERE id=e.id AND auth_user_id IS DISTINCT FROM u.id;
END $$;

CREATE FUNCTION public.upgrade_readiness()
RETURNS TABLE(employee_id bigint,ready boolean,reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; c app_private.pin_accounts; u auth.users; problem text;
BEGIN
 IF NOT EXISTS(SELECT FROM public."Employees" WHERE role='administrator' AND active IS TRUE AND archived_at IS NULL) THEN
   RETURN QUERY SELECT NULL::bigint,false,'NO_ACTIVE_ADMIN'::text; END IF;
 IF (SELECT count(*) FROM public."Employees" WHERE pin_hash IS NOT NULL)>32 THEN
   RETURN QUERY SELECT NULL::bigint,false,'PIN_PROFILE_CAP'::text; END IF;
 FOR e IN SELECT * FROM public."Employees" ORDER BY id LOOP
   problem:=NULL;
   SELECT * INTO u FROM auth.users WHERE id=e.auth_user_id;
   SELECT * INTO c FROM app_private.pin_accounts WHERE pin_accounts.employee_id=e.id;
   IF e.role IS NULL OR e.role NOT IN ('administrator','manager','su-chef','employee') OR e.active IS NULL
     OR (e.role<>'administrator' AND NOT EXISTS(SELECT FROM public."Locations" WHERE id=e.location_id AND active IS TRUE)) THEN problem:='PROFILE';
   ELSIF e.pin_hash IS NOT NULL AND e.pin_hash !~ '^\$2a\$(06|10)\$[./A-Za-z0-9]{53}$' THEN problem:='HASH_FORMAT';
   ELSIF e.role IN ('manager','su-chef','employee') AND (e.active OR e.pin_hash IS NOT NULL) THEN
     IF e.pin_hash IS NULL OR e.auth_user_id IS NULL OR c.auth_user_id IS DISTINCT FROM e.auth_user_id
       OR u.id IS NULL OR u.email IS DISTINCT FROM c.email OR u.email_confirmed_at IS NULL
       OR u.raw_app_meta_data->>'pin_employee_id' IS DISTINCT FROM e.id::text
       OR u.raw_app_meta_data->>'pin_provisioning_id' IS DISTINCT FROM c.provisioning_id::text THEN problem:='PIN_IDENTITY'; END IF;
   ELSIF e.role='administrator' AND e.active THEN
     IF u.id IS NULL OR u.email_confirmed_at IS NULL OR coalesce(u.encrypted_password,'')=''
       OR u.email IS NULL OR u.email LIKE '%.invalid' OR u.raw_app_meta_data ? 'pin_employee_id' THEN problem:='ADMIN_IDENTITY'; END IF;
   END IF;
   IF problem IS NULL AND e.active AND (u.last_sign_in_at IS NULL OR u.banned_until>now()) THEN problem:='LOGIN_NOT_VERIFIED'; END IF;
   RETURN QUERY SELECT e.id,problem IS NULL,coalesce(problem,'READY');
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.upgrade_candidates(),public.upgrade_pin_prepare(bigint),public.upgrade_pin_finish(bigint,uuid),
 public.upgrade_link_administrator(bigint,uuid),public.upgrade_readiness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_candidates(),public.upgrade_pin_prepare(bigint),public.upgrade_pin_finish(bigint,uuid),
 public.upgrade_link_administrator(bigint,uuid),public.upgrade_readiness() TO service_role;
COMMIT;
