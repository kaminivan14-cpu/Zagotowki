BEGIN;
ALTER TABLE public."Employees" ADD COLUMN avatar_path text;
CREATE UNIQUE INDEX employee_avatar_path_unique ON public."Employees"(avatar_path) WHERE avatar_path IS NOT NULL;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('employee-avatars','employee-avatars',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
-- Only employees already readable in Admin. Writes retain Admin employee capability
-- and the existing owner/admin, not-self, nonarchived account-edit restrictions.
CREATE FUNCTION public.employee_avatar_allowed(p_path text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";eid bigint;BEGIN
 IF NOT app_private.has_permission('tasks.admin') THEN RETURN false;END IF;
 a:=app_private.task_actor();
 IF p_path IS NULL OR p_path!~'^[0-9]+/[0-9a-f-]{36}\.(jpg|png|webp)$' THEN RETURN false;END IF;
 eid:=split_part(p_path,'/',1)::bigint;
 IF p_write THEN RETURN app_private.has_permission('employees.manage') AND a.role IN ('owner','administrator') AND eid<>a.id AND EXISTS(SELECT FROM public."Employees" WHERE id=eid AND archived_at IS NULL);END IF;
 RETURN EXISTS(SELECT FROM public."Employees" WHERE id=eid AND avatar_path=p_path) OR (app_private.has_permission('employees.manage') AND a.role IN ('owner','administrator') AND eid<>a.id);
END $$;
CREATE FUNCTION public.employee_avatar_unreferenced(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.employee_avatar_allowed(p_path,true) AND NOT EXISTS(SELECT FROM public."Employees" WHERE avatar_path=p_path)
$$;
CREATE FUNCTION public.employee_avatar_set(p_employee bigint,p_path text,p_expected text,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_path text;result jsonb;event public."Task_admin_events";meta jsonb;BEGIN
 IF p_operation IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(20260923,1);
 IF NOT public.employee_avatar_allowed(p_employee||'/'||p_operation||'.jpg',true) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO event FROM public."Task_admin_events" WHERE entity='employee_avatar' AND operation_id=p_operation;
 IF FOUND THEN
  IF event.actor_employee_id<>(app_private.task_actor()).id OR event.entity_id<>p_employee::text OR event.new_value->>'path' IS DISTINCT FROM p_path OR event.old_value->>'path' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'OPERATION_CONFLICT';END IF;
  RETURN jsonb_build_object('path',p_path,'old_path',p_expected);
 END IF;
 SELECT avatar_path INTO old_path FROM public."Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND OR old_path IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'AVATAR_CONFLICT';END IF;
 IF p_path IS NOT NULL THEN
  IF p_path NOT IN (p_employee||'/'||p_operation||'.jpg',p_employee||'/'||p_operation||'.png',p_employee||'/'||p_operation||'.webp') THEN RAISE EXCEPTION 'INVALID_AVATAR';END IF;
  SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='employee-avatars' AND name=p_path;
  IF meta IS NULL OR coalesce(meta->>'mimetype','') NOT IN ('image/jpeg','image/png','image/webp') OR coalesce((meta->>'size')::bigint,0) NOT BETWEEN 1 AND 5242880 THEN RAISE EXCEPTION 'INVALID_AVATAR';END IF;
 END IF;
 UPDATE public."Employees" SET avatar_path=p_path WHERE id=p_employee;
 PERFORM app_private.task_admin_audit('employee_avatar',p_employee::text,'set',jsonb_build_object('path',old_path),jsonb_build_object('path',p_path),p_operation);
 RETURN jsonb_build_object('path',p_path,'old_path',old_path);
END $$;
DO $$ DECLARE sig text;d text;needle text;BEGIN
 FOREACH sig IN ARRAY ARRAY['public.tasks_admin_directory()','public.tasks_access_directory()','public.organization_structure(bigint,date)'] LOOP
  d:=pg_get_functiondef(sig::regprocedure);needle:=CASE WHEN sig LIKE '%organization_structure%' THEN '''name'',name' ELSE '''name'',e.name' END;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT avatar read %',sig;END IF;
  EXECUTE replace(d,needle,CASE WHEN sig LIKE '%organization_structure%' THEN '''avatar_path'',avatar_path,' ELSE '''avatar_path'',e.avatar_path,' END||needle);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.employee_avatar_allowed(text,boolean),public.employee_avatar_unreferenced(text),public.employee_avatar_set(bigint,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.employee_avatar_allowed(text,boolean),public.employee_avatar_unreferenced(text),public.employee_avatar_set(bigint,text,text,uuid) TO authenticated;
COMMIT;
