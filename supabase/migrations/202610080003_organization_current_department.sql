BEGIN;
-- Immediate department edits create a new immutable current snapshot. Future
-- drafts/schedules are intentionally untouched. Reuses existing authority/audit.
CREATE FUNCTION public.organization_move_department(p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public."Employees";prior app_private.organization_structure_operations;emp bigint;dep bigint;current_id bigint;created jsonb;vid bigint;old_assignment jsonb;result jsonb;removed jsonb;
BEGIN
 actor:=app_private.task_actor();
 IF NOT app_private.has_permission('organization.manage') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(20261002,2);PERFORM pg_advisory_xact_lock(20261008,1);
 IF p_operation IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR p_args-ARRAY['employee_id','department_id','expected_version_id','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO prior FROM app_private.organization_structure_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.actor_employee_id<>actor.id OR prior.action<>'move_department' OR prior.args<>p_args THEN RAISE EXCEPTION 'OPERATION_CONFLICT';END IF;
  RETURN prior.result;
 END IF;
 PERFORM app_private.org_activate_due();current_id:=app_private.org_version(app_private.task_today());
 IF current_id IS DISTINCT FROM (p_args->>'expected_version_id')::bigint THEN RAISE EXCEPTION 'ORG_VERSION_CONFLICT';END IF;
 emp:=(p_args->>'employee_id')::bigint;dep:=(p_args->>'department_id')::bigint;
 IF NOT EXISTS(SELECT FROM public."Employees" WHERE id=emp) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF dep IS NOT NULL AND NOT EXISTS(SELECT FROM public."Departments" WHERE id=dep AND active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
 SELECT to_jsonb(a) INTO old_assignment FROM app_private.org_assignments(app_private.task_today())a WHERE employee_id=emp;
 IF (old_assignment->>'department_id')::bigint IS NOT DISTINCT FROM dep THEN
  result:=jsonb_build_object('id',current_id,'unchanged',true);
 ELSE
  created:=public.organization_command('create',jsonb_build_object('name','Зміна відділу · '||app_private.task_today(),'reason',p_args->>'reason'),gen_random_uuid());
  vid:=(created->>'id')::bigint;
  UPDATE public.organization_structure_assignments SET department_id=dep WHERE structure_version_id=vid AND employee_id=emp;
  SELECT coalesce(jsonb_agg(department_id),'[]') INTO removed FROM public.organization_structure_directors WHERE structure_version_id=vid AND employee_id=emp AND department_id IS DISTINCT FROM dep;
  DELETE FROM public.organization_structure_directors WHERE structure_version_id=vid AND employee_id=emp AND department_id IS DISTINCT FROM dep;
  PERFORM app_private.org_validate(vid);
  -- Same-day revisions retain timestamps in audit; date queries resolve newest ID.
  UPDATE public.organization_structure_versions SET status='archived',effective_to=CASE WHEN effective_from<app_private.task_today() THEN app_private.task_today() ELSE NULL END WHERE status='active';
  UPDATE public.organization_structure_versions SET status='active',effective_from=app_private.task_today(),activated_at=clock_timestamp() WHERE id=vid;
  INSERT INTO app_private.organization_structure_events(structure_version_id,actor_employee_id,action,before_value,after_value,reason)
  VALUES(vid,actor.id,'move_department',old_assignment,jsonb_build_object('employee_id',emp,'department_id',dep,'removed_director_departments',removed),p_args->>'reason');
  result:=jsonb_build_object('id',vid,'employee_id',emp,'department_id',dep);
 END IF;
 INSERT INTO app_private.organization_structure_operations VALUES(p_operation,actor.id,'move_department',p_args,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.organization_move_department(jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.organization_move_department(jsonb,uuid) TO authenticated;
COMMIT;
