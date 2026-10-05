-- Explicit post-deployment operation only. Never include in automatic migration discovery.
-- Target must be externally verified as ssheqxdgsmndiutthxvd.
-- Keep both old Auth users: ban each through trusted Auth Admin API after COMMIT.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(20260923,1);
DO $$ DECLARE e public."Employees";u auth.users;c app_private.pin_accounts; BEGIN
 FOR e IN SELECT * FROM public."Employees" WHERE id IN (2,8) ORDER BY id FOR UPDATE LOOP
  IF e.role<>'manager' THEN RAISE EXCEPTION 'MANAGER_ROLE_CHANGED %',e.id;END IF;
  IF e.auth_user_id IS NULL THEN
   IF NOT EXISTS(SELECT FROM app_private.employee_auth_events WHERE employee_id=e.id AND reason='manager email auth migration' AND new_auth_user_id IS NULL) THEN RAISE EXCEPTION 'UNEXPECTED_UNLINKED_MANAGER %',e.id;END IF;
   CONTINUE;
  END IF;
  SELECT * INTO u FROM auth.users WHERE id=e.auth_user_id;
  SELECT * INTO c FROM app_private.pin_accounts WHERE employee_id=e.id;
  IF u.id IS NULL OR c.auth_user_id IS DISTINCT FROM u.id OR c.email IS DISTINCT FROM u.email
   OR u.email !~ '@pin[.]prod[.]invalid$' THEN RAISE EXCEPTION 'IDENTITY_DRIFT %',e.id;END IF;
  IF EXISTS(SELECT FROM public."Task_files" WHERE uploaded_by=e.id OR split_part(object_key,'/',1)=u.id::text)
   OR EXISTS(SELECT FROM storage.objects WHERE split_part(name,'/',1)=u.id::text OR owner=u.id OR owner_id=u.id::text)
   THEN RAISE EXCEPTION 'MANAGER_HAS_FILES %',e.id;END IF;
  INSERT INTO app_private.employee_auth_events(employee_id,old_auth_user_id,new_auth_user_id,actor,reason)
   VALUES(e.id,u.id,NULL,session_user||': authorized feature/manager-email-auth rollout','manager email auth migration');
  UPDATE public."Employees" SET auth_user_id=NULL WHERE id=e.id;
  DELETE FROM app_private.pin_accounts WHERE employee_id=e.id;
 END LOOP;
 IF (SELECT count(*) FROM public."Employees" WHERE id IN (2,8) AND role='manager')<>2 THEN RAISE EXCEPTION 'MISSING_MANAGER';END IF;
END $$;
COMMIT;
