BEGIN;
-- One policy for enforcement and inspection. Preserve the installed UAT/Production
-- predicate (including Production release exclusions), without duplicating a matrix.
DO $$ DECLARE original text; body text; BEGIN
 SELECT prosrc INTO original FROM pg_proc WHERE oid='app_private.has_permission(text)'::regprocedure;
 body:=replace(original,'public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role','app_private.role_permissions p');
 body:=replace(body,'e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL AND','p.role=p_role AND');
 body:=regexp_replace(body,'\me\.role\M','p_role','g');
 IF original=body OR position('auth.uid()' IN body)>0 OR body ~ '\me\.' OR position('p.role=p_role' IN body)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT has_permission';END IF;
 EXECUTE format('CREATE FUNCTION app_private.role_has_permission(p_role text,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS %L',body);
END $$;
CREATE OR REPLACE FUNCTION app_private.has_permission(p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public."Employees" e WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL AND app_private.role_has_permission(e.role,p_permission))
$$;
REVOKE ALL ON FUNCTION app_private.role_has_permission(text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tasks_access_directory() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object(
 'roles',(SELECT jsonb_agg(jsonb_build_object('role',r.role,'user_count',(SELECT count(*) FROM public."Employees" WHERE role=r.role),'capabilities',(SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') FROM app_private.role_permissions p WHERE p.role=r.role AND app_private.role_has_permission(r.role,p.permission))) ORDER BY r.role) FROM (SELECT unnest(ARRAY['owner','administrator','director','manager','expert','specialist']) role UNION SELECT role FROM app_private.role_permissions)r),
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'role',e.role,'production_role',e.production_role,'active',e.active,'archived',e.archived_at IS NOT NULL,'linked',e.auth_user_id IS NOT NULL,'department_id',a.department_id,'location_id',e.location_id,'manager_id',a.manager_employee_id,
 'capabilities',(SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') FROM app_private.role_permissions p WHERE p.role=e.role AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL AND app_private.role_has_permission(e.role,p.permission)),
 'hierarchy_ids',CASE WHEN e.role IN ('manager','director') THEN (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public."Employees" sub WHERE sub.id<>e.id AND app_private.task_descendant(e.id,sub.id,app_private.task_today())) ELSE '[]'::jsonb END) ORDER BY e.name,e.id),'[]') FROM public."Employees"e JOIN app_private.org_assignments(app_private.task_today()) a ON a.employee_id=e.id),
 'departments',(SELECT coalesce(jsonb_agg(d ORDER BY name),'[]') FROM public."Departments" d),
 'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) ORDER BY name),'[]') FROM public."Locations"),
 'scope_grants',(SELECT coalesce(jsonb_agg(g ORDER BY id),'[]') FROM public."Task_scope_grants"g));
END $$;
REVOKE ALL ON FUNCTION public.tasks_access_directory() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tasks_access_directory() TO authenticated;
COMMIT;
