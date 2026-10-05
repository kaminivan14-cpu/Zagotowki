-- Minimal Production invitation upgrade; no existing employee, Auth or PIN changes.
-- Do not apply the combined 202610070001 migration after this partial rollout.
BEGIN;
CREATE TABLE app_private.employee_invitations(
 operation_id uuid PRIMARY KEY, employee_id bigint NOT NULL REFERENCES public."Employees"(id),
 actor_employee_id bigint NOT NULL REFERENCES public."Employees"(id), email text NOT NULL,
 auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 status text NOT NULL CHECK(status IN ('pending','linked','failed')),
 result text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz);
CREATE UNIQUE INDEX employee_invitation_pending ON app_private.employee_invitations(employee_id) WHERE status='pending';
ALTER TABLE app_private.employee_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.employee_invitations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.auth_email_access() RETURNS TABLE(employee_id bigint,access_state text,can_invite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; BEGIN
 a:=app_private.actor();
 IF a.role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT e.id,
 CASE WHEN EXISTS(SELECT FROM app_private.employee_invitations i WHERE i.employee_id=e.id AND i.status='pending') THEN 'pending'
 WHEN e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL AND coalesce(u.email,'') NOT LIKE '%@pin.%.invalid' AND nullif(u.email,'') IS NOT NULL
   AND nullif(to_jsonb(u)->>'email_confirmed_at','') IS NOT NULL AND nullif(to_jsonb(u)->>'encrypted_password','') IS NOT NULL
   AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now() THEN 'active'
 WHEN EXISTS(SELECT FROM app_private.employee_invitations i WHERE i.employee_id=e.id AND i.status='pending')
 OR (e.auth_user_id IS NOT NULL AND nullif(u.email,'') IS NOT NULL AND u.email NOT LIKE '%@pin.%.invalid' AND nullif(to_jsonb(u)->>'invited_at','') IS NOT NULL) THEN 'invited'
 ELSE 'none' END,
 e.active AND e.archived_at IS NULL AND e.auth_user_id IS NULL
 AND NOT EXISTS(SELECT FROM app_private.employee_invitations i WHERE i.employee_id=e.id AND i.status='pending')
 FROM public."Employees" e LEFT JOIN auth.users u ON u.id=e.auth_user_id
 WHERE e.role IN ('administrator','manager','director','expert','specialist');
END $$;
REVOKE ALL ON FUNCTION public.auth_email_access() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.auth_email_access() TO authenticated;
CREATE FUNCTION public.auth_invite_command(p_actor uuid,p_employee bigint,p_action text,p_email text DEFAULT NULL,p_operation uuid DEFAULT NULL,p_auth_user uuid DEFAULT NULL,p_result text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";e public."Employees";i app_private.employee_invitations;u auth.users;BEGIN
 PERFORM pg_advisory_xact_lock(20260923,1);
 SELECT * INTO a FROM public."Employees" WHERE auth_user_id=p_actor AND active AND archived_at IS NULL;
 IF NOT FOUND OR a.role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public."Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND OR NOT e.active OR e.archived_at IS NOT NULL OR e.role NOT IN ('administrator','manager','director','expert','specialist') THEN RAISE EXCEPTION 'Unavailable target' USING ERRCODE='42501';END IF;
 IF p_action='begin' THEN
  IF e.auth_user_id IS NOT NULL THEN RETURN jsonb_build_object('state','linked');END IF;
  IF EXISTS(SELECT FROM app_private.employee_invitations WHERE employee_id=e.id AND status='pending') THEN RETURN jsonb_build_object('state','pending');END IF;
  IF p_operation IS NULL OR p_email IS NULL OR length(p_email)>254 OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_email LIKE '%@pin.%.invalid' THEN RAISE EXCEPTION 'Invalid email';END IF;
  IF EXISTS(SELECT FROM auth.users WHERE lower(email)=lower(trim(p_email))) THEN
   INSERT INTO app_private.employee_invitations(operation_id,employee_id,actor_employee_id,email,status,result,finished_at) VALUES(p_operation,e.id,a.id,lower(trim(p_email)),'failed','AUTH_ACCOUNT_EXISTS',clock_timestamp());
   RETURN jsonb_build_object('state','exists');END IF;
  INSERT INTO app_private.employee_invitations(operation_id,employee_id,actor_employee_id,email,status) VALUES(p_operation,e.id,a.id,lower(trim(p_email)),'pending');
  RETURN jsonb_build_object('state','reserved');
 END IF;
 SELECT * INTO i FROM app_private.employee_invitations WHERE operation_id=p_operation AND employee_id=e.id AND actor_employee_id=a.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid operation';END IF;
 IF p_action='complete' THEN
  IF i.status='linked' AND i.auth_user_id=p_auth_user AND e.auth_user_id=p_auth_user THEN RETURN jsonb_build_object('state','linked');END IF;
  IF i.status<>'pending' OR e.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'Identity conflict';END IF;
  SELECT * INTO u FROM auth.users WHERE id=p_auth_user;
  IF NOT FOUND OR lower(u.email) IS DISTINCT FROM i.email OR EXISTS(SELECT FROM public."Employees" WHERE auth_user_id=p_auth_user) THEN RAISE EXCEPTION 'Identity conflict';END IF;
  UPDATE public."Employees" SET auth_user_id=p_auth_user WHERE id=e.id;
  UPDATE app_private.employee_invitations SET status='linked',auth_user_id=p_auth_user,result='OK',finished_at=clock_timestamp() WHERE operation_id=i.operation_id;
  RETURN jsonb_build_object('state','linked');
 ELSIF p_action='failed' AND i.status='pending' AND p_result IN ('AUTH_ACCOUNT_EXISTS','INVITE_EMAIL_NOT_AUTHORIZED','INVITE_RATE_LIMIT') THEN
  UPDATE app_private.employee_invitations SET status='failed',result=p_result,finished_at=clock_timestamp() WHERE operation_id=i.operation_id;
  RETURN jsonb_build_object('state','failed');
 END IF;
 RAISE EXCEPTION 'Invalid operation';
END $$;
REVOKE ALL ON FUNCTION public.auth_invite_command(uuid,bigint,text,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_invite_command(uuid,bigint,text,text,uuid,uuid,text) TO service_role;
INSERT INTO app_private.production_module_releases(release,manifest) VALUES ('employee_invitation_v1',jsonb_build_object('file','08_invitation_backend.sql','scope','invitation RPC and private audit only'));
COMMIT;
