-- Apply AFTER 02_provisioning_api.sql, only while PREPARE is active.
-- No identity, PIN, hash or Auth timestamp updates. Safe to repeat before CUTOVER.
BEGIN;
SELECT app_private.upgrade_prepared();
CREATE OR REPLACE FUNCTION public.upgrade_readiness()
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
   -- A ban is a technical blocker regardless of login history or employee activity.
   IF problem IS NULL AND u.banned_until>now() THEN problem:='AUTH_BANNED'; END IF;
   RETURN QUERY SELECT e.id,problem IS NULL,coalesce(problem,'READY');
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upgrade_login_coverage()
RETURNS TABLE(employee_id bigint,login_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.id,CASE WHEN u.last_sign_in_at IS NULL THEN 'LOGIN_NOT_TESTED' ELSE 'LOGIN_TESTED' END
 FROM public."Employees" e LEFT JOIN auth.users u ON u.id=e.auth_user_id ORDER BY e.id
$$;
-- Coverage means a hosted Auth timestamp exists, not proof of login method or RLS tests.
REVOKE ALL ON FUNCTION public.upgrade_readiness(),public.upgrade_login_coverage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_readiness(),public.upgrade_login_coverage() TO service_role;
COMMIT;
